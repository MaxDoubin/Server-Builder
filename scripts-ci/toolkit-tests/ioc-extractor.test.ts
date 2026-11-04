import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import {
  MAX_DISTINCT,
  MAX_INPUT_CHARS,
  allTypes,
  base58Decode,
  checkBase58Address,
  csvField,
  decodeSegwit,
  describeSegwit,
  extractIocs,
  renderValue,
  sha256,
  toCsv,
  toHex,
  toJson,
  toPlainLists,
  type ExtractOptions,
} from "../../client/src/lib/toolkit/ioc-extractor.ts";

let passed = 0;
function t(name: string, fn: () => void) {
  try {
    fn();
    passed++;
  } catch (e) {
    console.error(`FAIL ${name}`);
    throw e;
  }
}

const enc = (s: string) => new TextEncoder().encode(s);
const opts = (over: Partial<ExtractOptions> = {}): ExtractOptions => ({
  types: allTypes(),
  includeHosts: true,
  keepAmbiguous: false,
  ...over,
});
const run = (text: string, over: Partial<ExtractOptions> = {}) => {
  const r = extractIocs(text, opts(over));
  assert.ok(r.ok, r.ok ? "" : r.error);
  return r;
};

/* SHA-256: FIPS 180-4 / NIST CSRC example vectors */
t("sha256 vectors", () => {
  assert.equal(toHex(sha256(enc(""))), "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
  assert.equal(toHex(sha256(enc("abc"))), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  assert.equal(
    toHex(sha256(enc("abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq"))),
    "248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1",
  );
  // Padding boundaries: 55, 56, 63, 64, 65 bytes, plus random lengths, against node:crypto.
  for (const len of [0, 1, 55, 56, 57, 63, 64, 65, 119, 120, 127, 128, 129, 1000]) {
    const data = randomBytes(len);
    assert.equal(toHex(sha256(new Uint8Array(data))), createHash("sha256").update(data).digest("hex"), `len ${len}`);
  }
});

/* Base58Check */
t("base58check addresses", () => {
  // The genesis block coinbase address, and the P2PKH / P2SH examples from the Bitcoin wiki.
  assert.equal(checkBase58Address("1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa"), "P2PKH, Base58Check");
  assert.equal(checkBase58Address("1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2"), "P2PKH, Base58Check");
  assert.equal(checkBase58Address("3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy"), "P2SH, Base58Check");
  // One character changed: checksum fails.
  assert.equal(checkBase58Address("1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNb"), null);
  assert.equal(checkBase58Address("1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN3"), null);
  // Characters outside the alphabet (0, O, I, l).
  assert.equal(checkBase58Address("1A1zP1eP5QGefi2DMPTfTL5SLmv7Divf0a"), null);
  assert.deepEqual(Array.from(base58Decode("1112") ?? []), [0, 0, 0, 1]);
  assert.equal(base58Decode("0"), null);
});

/* Bech32 / Bech32m: BIP 173 and BIP 350 test vectors */
t("segwit addresses", () => {
  const p2wpkh = decodeSegwit("BC1QW508D6QEJXTDG4Y5R3ZARVARY0C5XW7KV8F3T4");
  assert.ok(p2wpkh);
  assert.equal(p2wpkh.version, 0);
  assert.equal(p2wpkh.encoding, "bech32");
  assert.equal(Buffer.from(p2wpkh.program).toString("hex"), "751e76e8199196d454941c45d1b3a323f1433bd6");
  assert.equal(describeSegwit(p2wpkh), "P2WPKH, Bech32");

  const p2wsh = decodeSegwit("bc1qrp33g0q5c5txsp9arysrx4k6zdkfs4nce4xj0gdcccefvpysxf3qccfmv3");
  assert.ok(p2wsh);
  assert.equal(describeSegwit(p2wsh), "P2WSH, Bech32");

  const v1 = decodeSegwit("bc1pw508d6qejxtdg4y5r3zarvary0c5xw7kw508d6qejxtdg4y5r3zarvary0c5xw7kt5nd6y");
  assert.ok(v1);
  assert.equal(v1.version, 1);
  assert.equal(v1.encoding, "bech32m");
  assert.equal(v1.program.length, 40);

  const v16 = decodeSegwit("BC1SW50QGDZ25J");
  assert.ok(v16);
  assert.equal(v16.version, 16);
  assert.equal(v16.program.length, 2);

  const v2 = decodeSegwit("bc1zw508d6qejxtdg4y5r3zarvaryvaxxpcs");
  assert.ok(v2);
  assert.equal(v2.version, 2);
  assert.equal(v2.program.length, 16);

  const taproot = decodeSegwit("bc1p0xlxvlhemja6c4dqv22uapctqupfhlxm9h8z3k2e72q4k9hcz7vqzk5jj0");
  assert.ok(taproot);
  assert.equal(describeSegwit(taproot), "Taproot, Bech32m");

  // BIP 350 invalid vectors.
  assert.equal(decodeSegwit("bc1p0xlxvlhemja6c4dqv22uapctqupfhlxm9h8z3k2e72q4k9hcz7vqh2y7hd"), null, "bech32 used for v1");
  assert.equal(decodeSegwit("BC1S0XLXVLHEMJA6C4DQV22UAPCTQUPFHLXM9H8Z3K2E72Q4K9HCZ7VQ54WELL"), null, "bech32 used for v16");
  assert.equal(decodeSegwit("bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kemeawh"), null, "bech32m used for v0");
  assert.equal(decodeSegwit("bc1zw508d6qejxtdg4y5r3zarvaryvqyzf3du"), null, "invalid padding");
  assert.equal(decodeSegwit("bc1gmk9yu"), null, "empty data");
  // Mixed case, testnet prefix, one flipped character.
  assert.equal(decodeSegwit("bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3T4"), null);
  assert.equal(decodeSegwit("tb1qrp33g0q5c5txsp9arysrx4k6zdkfs4nce4xj0gdcccefvpysxf3q0sl5k7"), null);
  assert.equal(decodeSegwit("bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t5"), null);
});

/* extraction */
const SAMPLE = [
  "Incident 4471. Phishing mail from billing[@]example[.]net linked to hxxps://login-portal.example[.]com/verify?id=7.",
  "Stage two pulled from hxxp://198.51.100[.]23:8080/drop/a.bin and beaconed to 203.0.113.9 every 60s.",
  "Same host again: 203.0.113.9. IPv6 C2 2001:DB8:0:0::bad:1 and update-check.example.org.",
  "Hashes: MD5 44D88612FEA8A8F36DE82E1278ABB02F, SHA-1 3395856ce81f2b7382dee72602f798b642f14140,",
  "SHA-256 275a021bbfb6489e54d471899f7db9d1663fc695ec2fe2a2c4538aabf651fd0f.",
  "Exploited CVE-2021-44228 and cve-2023-23397. Ransom to 1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa or",
  "bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4. Attachments: invoice.zip, setup.py, report.pdf.",
  "Bad checksum: 1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNb. Not a hash: 00000000000000000000000000000000.",
].join("\n");

t("sample extraction", () => {
  const r = run(SAMPLE);
  const by = (type: string) => r.indicators.filter((i) => i.type === type).map((i) => i.value);
  assert.deepEqual(by("url"), ["https://login-portal.example.com/verify?id=7", "http://198.51.100.23:8080/drop/a.bin"]);
  assert.deepEqual(by("domain"), ["example.net", "login-portal.example.com", "update-check.example.org"]);
  assert.deepEqual(by("ipv4"), ["198.51.100.23", "203.0.113.9"]);
  assert.deepEqual(by("ipv6"), ["2001:db8::bad:1"]);
  assert.deepEqual(by("email"), ["billing@example.net"]);
  assert.deepEqual(by("md5"), ["44d88612fea8a8f36de82e1278abb02f"]);
  assert.deepEqual(by("sha1"), ["3395856ce81f2b7382dee72602f798b642f14140"]);
  assert.deepEqual(by("sha256"), ["275a021bbfb6489e54d471899f7db9d1663fc695ec2fe2a2c4538aabf651fd0f"]);
  assert.deepEqual(by("cve"), ["CVE-2021-44228", "CVE-2023-23397"]);
  assert.deepEqual(by("btc"), ["1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa", "bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4"]);
  assert.deepEqual(r.skippedFileNames, ["invoice.zip", "setup.py"]);
  assert.equal(r.badChecksums, 1);
  const ip = r.byType.ipv4.find((i) => i.value === "203.0.113.9");
  assert.ok(ip);
  assert.equal(ip.count, 2);
  assert.equal(ip.firstLine, 2);
  assert.equal(ip.writtenDefanged, false);
  assert.equal(r.byType.ipv4[0].writtenDefanged, true);
  assert.equal(r.byType.btc[0].detail, "P2PKH, Base58Check");
  assert.equal(r.lines, 8);
});

t("hosts option and type filter", () => {
  const without = run(SAMPLE, { includeHosts: false });
  assert.deepEqual(without.byType.domain.map((i) => i.value), ["update-check.example.org"]);
  assert.deepEqual(without.byType.ipv4.map((i) => i.value), ["203.0.113.9"]);
  const types = allTypes(false);
  types.cve = true;
  const only = run(SAMPLE, { types });
  assert.deepEqual(only.indicators.map((i) => i.type), ["cve", "cve"]);
});

t("hash and cve boundaries", () => {
  const r = run(
    "x44d88612fea8a8f36de82e1278abb02f 0x44d88612fea8a8f36de82e1278abb02f file_44d88612fea8a8f36de82e1278abb02f.exe " +
      "12345678901234567890123456789012 abcdefabcdefabcdefabcdefabcdefab CVE-1998-0001 CVE-2014-123 XCVE-2020-1234 CVE-2020-12345678 " +
      "CVE-2014-00001 CVE-2014-0001 CVE-2014-0001x",
  );
  assert.deepEqual(r.byType.md5.map((i) => [i.value, i.count]), [["44d88612fea8a8f36de82e1278abb02f", 1]]);
  assert.deepEqual(r.byType.cve.map((i) => i.value), ["CVE-2020-12345678", "CVE-2014-0001"]);
});

t("rendering", () => {
  const r = run(SAMPLE);
  const url = r.byType.url[0];
  assert.equal(renderValue(url, "defanged"), "hxxps://login-portal[.]example[.]com/verify?id=7");
  assert.equal(renderValue(url, "refanged"), "https://login-portal.example.com/verify?id=7");
  assert.equal(renderValue(r.byType.email[0], "defanged"), "billing[@]example[.]net");
  assert.equal(renderValue(r.byType.ipv6[0], "defanged"), "2001[:]db8[:][:]bad[:]1");
  assert.equal(renderValue(r.byType.md5[0], "defanged"), "44d88612fea8a8f36de82e1278abb02f");
});

t("nested url rendering", () => {
  const r = run("Redirect https://r.example.com/out?to=http://evil.example.net/x&y=1");
  assert.deepEqual(r.byType.url.map((i) => i.value), ["https://r.example.com/out?to=http://evil.example.net/x&y=1", "http://evil.example.net/x"]);
  assert.equal(renderValue(r.byType.url[0], "defanged"), "hxxps://r[.]example[.]com/out?to=hxxp://evil[.]example[.]net/x&y=1");
  assert.deepEqual(r.byType.domain.map((i) => i.value), ["r.example.com", "evil.example.net"]);
});

t("csv json plain", () => {
  assert.equal(csvField("plain"), "plain");
  assert.equal(csvField('a"b'), '"a""b"');
  assert.equal(csvField("a,b"), '"a,b"');
  assert.equal(csvField("=HYPERLINK(1)"), "'=HYPERLINK(1)");
  assert.equal(csvField("-x@evil.com"), "'-x@evil.com");
  assert.equal(csvField("@SUM(1,2)"), `"'@SUM(1,2)"`);
  const r = run("evil.example.com, again evil.example.com\nCVE-2021-44228");
  const csv = toCsv(r.indicators, "defanged");
  assert.equal(
    csv,
    "type,value,count,first_line,written_defanged,detail\r\ndomain,evil[.]example[.]com,2,1,false,\r\ncve,CVE-2021-44228,1,2,false,\r\n",
  );
  const json = JSON.parse(toJson(r.indicators, "refanged"));
  assert.equal(json.rendering, "refanged");
  assert.deepEqual(json.counts, { domain: 1, cve: 1 });
  assert.equal(json.indicators[0].value, "evil.example.com");
  assert.equal(json.indicators[0].count, 2);
  assert.equal(toPlainLists(r.indicators, "defanged"), "# Domains (1)\nevil[.]example[.]com\n\n# CVE IDs (1)\nCVE-2021-44228\n");
  assert.equal(toPlainLists([], "defanged"), "");
});

t("empty, huge, and distinct cap", () => {
  const empty = run("");
  assert.equal(empty.indicators.length, 0);
  assert.equal(empty.occurrences, 0);
  const big = extractIocs("a".repeat(MAX_INPUT_CHARS + 1), opts());
  assert.equal(big.ok, false);
  const many: string[] = [];
  for (let i = 0; i < MAX_DISTINCT + 50; i++) many.push(`10.${(i >> 16) & 255}.${(i >> 8) & 255}.${i & 255}`);
  const r = run(many.join(" "));
  assert.equal(r.indicators.length, MAX_DISTINCT);
  assert.equal(r.truncated, true);
});

t("cve ids with typographic hyphens, glue, and mail case", () => {
  const r = run("CVE\u20112021\u201144228 CVE\u20132022\u20130001 CVE\u22122020\u20131234 CVE-2021-44228 \u00fcCVE-2020-9999");
  assert.deepEqual(r.byType.cve.map((i) => [i.value, i.count]), [["CVE-2021-44228", 2], ["CVE-2022-0001", 1], ["CVE-2020-1234", 1]]);
  const h = run("\u00fc44d88612fea8a8f36de82e1278abb02f \u5b57 44d88612fea8a8f36de82e1278abb02f");
  assert.deepEqual(h.byType.md5.map((i) => [i.value, i.count]), [["44d88612fea8a8f36de82e1278abb02f", 1]]);
  const e = run("Bob@Example.com bob@example.com BOB@EXAMPLE.COM", { includeHosts: false });
  assert.deepEqual(e.byType.email.map((i) => [i.value, i.count]), [["bob@example.com", 3]]);
});

t("ranges and ipv6 and types counted once", () => {
  const r = run("198.51.100.1-198.51.100.3 and 198.51.100.2", { includeHosts: false });
  assert.deepEqual(r.byType.ipv4.map((i) => [i.value, i.count]), [["198.51.100.1", 1], ["198.51.100.3", 1], ["198.51.100.2", 1]]);
  // Four spellings of one address: plain, expanded, bracketed with a port, and as a URL host.
  const v6 = run("2001:db8::1 2001:0DB8:0:0:0:0:0:1 [2001:db8::1]:443 http://[2001:db8::1]/x");
  assert.deepEqual(v6.byType.ipv6.map((i) => [i.value, i.count]), [["2001:db8::1", 4]]);
});

t("linear time on adversarial input", () => {
  const cases = [
    "1".repeat(900_000),
    "bc1".repeat(300_000),
    "bc1qqqqqqqqqqqqqqqqqqqq ".repeat(40_000),
    "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNb ".repeat(25_000),
    "CVE-2021-".repeat(100_000),
    `CVE-2021-${"9".repeat(900_000)}`,
    "44d88612fea8a8f36de82e1278abb02f ".repeat(30_000),
    "a".repeat(32).repeat(25_000),
    "http://a.com/".repeat(70_000),
    "a@b.com ".repeat(100_000),
    "\u00fc".repeat(300_000),
  ];
  for (const c of cases) {
    const u0 = process.cpuUsage();
    const r = extractIocs(c.slice(0, MAX_INPUT_CHARS), opts());
    const u = process.cpuUsage(u0);
    const ms = (u.user + u.system) / 1000;
    assert.ok(r.ok);
    assert.ok(ms < 4000, `${c.slice(0, 12)} took ${ms}ms of CPU`);
  }
});

/* ----------------------------------------------- independent verifier cases */

t("verifier: FIPS 180-2 SHA-256 vectors and block boundaries", () => {
  const enc = new TextEncoder();
  assert.equal(toHex(sha256(enc.encode("abc"))), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  assert.equal(toHex(sha256(enc.encode(""))), "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
  assert.equal(
    toHex(sha256(enc.encode("abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq"))),
    "248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1",
  );
  for (const n of [55, 56, 63, 64, 65, 119, 120, 1000]) {
    const b = new Uint8Array(n).fill(0x61);
    assert.equal(toHex(sha256(b)), createHash("sha256").update(b).digest("hex"), `length ${n}`);
  }
});

t("verifier: BIP 350 valid and invalid mainnet vectors", () => {
  const valid: [string, string][] = [
    ["BC1QW508D6QEJXTDG4Y5R3ZARVARY0C5XW7KV8F3T4", "P2WPKH, Bech32"],
    ["bc1pw508d6qejxtdg4y5r3zarvary0c5xw7kw508d6qejxtdg4y5r3zarvary0c5xw7kt5nd6y", "Witness v1, Bech32m"],
    ["BC1SW50QGDZ25J", "Witness v16, Bech32m"],
    ["bc1p0xlxvlhemja6c4dqv22uapctqupfhlxm9h8z3k2e72q4k9hcz7vqzk5jj0", "Taproot, Bech32m"],
    ["bc1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqthqst8", "P2WSH, Bech32"],
  ];
  for (const [a, desc] of valid) {
    const s = decodeSegwit(a);
    assert.ok(s, a);
    assert.equal(describeSegwit(s), desc, a);
  }
  const invalid = [
    "bc1p0xlxvlhemja6c4dqv22uapctqupfhlxm9h8z3k2e72q4k9hcz7vqh2y7hd", // Bech32 checksum on v1
    "BC1S0XLXVLHEMJA6C4DQV22UAPCTQUPFHLXM9H8Z3K2E72Q4K9HCZ7VQ54WELL",
    "bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kemeawh", // Bech32m checksum on v0
    "bc1p38j9r5y49hruaue7wxjce0updqjuyyx0kh56v8s25huc6995vvpql3jow4", // invalid character
    "BC130XLXVLHEMJA6C4DQV22UAPCTQUPFHLXM9H8Z3K2E72Q4K9HCZ7VQ7ZWS8R", // version 17
    "bc1pw5dgrnzv", // 1 byte program
    "BC1QR508D6QEJXTDG4Y5R3ZARVARYV98GJ9P", // 16 byte v0 program
    "bc1p0xlxvlhemja6c4dqv22uapctqupfhlxm9h8z3k2e72q4k9hcz7vq47Zagq", // mixed case
    "bc1gmk9yu", // empty data
    "bc1pqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq5us4ke", // v1 with a Bech32 checksum
    "tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx", // testnet HRP
  ];
  for (const a of invalid) assert.equal(decodeSegwit(a), null, a);
});

t("verifier: Base58Check genesis and BIP 16 addresses, one character off fails", () => {
  assert.equal(checkBase58Address("1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa"), "P2PKH, Base58Check");
  assert.equal(checkBase58Address("3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy"), "P2SH, Base58Check");
  assert.equal(checkBase58Address("1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNb"), null);
  assert.equal(checkBase58Address("1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfN0"), null);
  assert.equal(checkBase58Address(""), null);
  const r = extractIocs("pay 1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNb now", opts());
  assert.ok(r.ok && r.byType.btc.length === 0 && r.badChecksums === 1);
});

t("verifier: CVE ID syntax boundaries", () => {
  const r = extractIocs(
    "CVE-1999-0001 CVE-1998-0001 CVE-2014-0160 CVE-2021-01234 CVE-2021-123 CVE-2024-1234567890123456789 CVE-2024-12345678901234567890 xCVE-2021-44228 CVE-2021-44228a cve-2021-44228",
    opts(),
  );
  assert.ok(r.ok);
  assert.deepEqual(
    r.byType.cve.map((i) => `${i.value}x${i.count}`),
    ["CVE-1999-0001x1", "CVE-2014-0160x1", "CVE-2024-1234567890123456789x1", "CVE-2021-44228x1"],
  );
});

t("verifier: hashes are whole hex runs, case folded, counted", () => {
  const md5 = "44d88612fea8a8f36de82e1278abb02f";
  const r = extractIocs(`${md5} ${md5.toUpperCase()} ${md5}0 g${md5} ${"1".repeat(32)} ${"a".repeat(40)}`, opts());
  assert.ok(r.ok);
  assert.deepEqual(r.byType.md5.map((i) => `${i.value}x${i.count}`), [`${md5}x2`]);
  assert.equal(r.byType.sha1.length, 0);
});

t("verifier: empty, whitespace, unicode and oversize input never throw", () => {
  for (const s of ["", "   \n\t", "\uD800", "\u{1F600}".repeat(1000), "\u0000\u0001", "[.]".repeat(1000)]) {
    const r = extractIocs(s, opts());
    assert.ok(r.ok);
    assert.equal(r.indicators.length, 0);
  }
  const big = extractIocs("x".repeat(MAX_INPUT_CHARS + 1), opts());
  assert.equal(big.ok, false);
});

t("verifier: defanged and live forms dedupe, output renders defanged", () => {
  const r = extractIocs("hxxps[:]//evil[dot]com/a https://EVIL.com/a bob[at]evil(.)com Bob@Evil.com", opts());
  assert.ok(r.ok);
  const url = r.byType.url[0];
  assert.equal(url.value, "https://evil.com/a");
  assert.equal(url.count, 2);
  assert.equal(renderValue(url, "defanged"), "hxxps://evil[.]com/a");
  assert.equal(r.byType.email[0].count, 2);
  assert.equal(renderValue(r.byType.email[0], "defanged"), "bob[@]evil[.]com");
});


/* ===== Independent verifier additions =====
   Reference encoders below are written from the specs (BIP 173, BIP 350,
   Base58Check), not copied from the implementation under test. */

const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
function refBase58Check(version: number, hash: Uint8Array): string {
  const payload = Buffer.concat([Buffer.from([version]), Buffer.from(hash)]);
  const sum = createHash("sha256").update(createHash("sha256").update(payload).digest()).digest().subarray(0, 4);
  const full = Buffer.concat([payload, sum]);
  let n = BigInt("0x" + full.toString("hex"));
  let out = "";
  while (n > 0n) {
    out = B58[Number(n % 58n)] + out;
    n /= 58n;
  }
  for (const b of full) {
    if (b === 0) out = "1" + out;
    else break;
  }
  return out;
}

const CS = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";
function refPolymod(values: number[]): number {
  const GEN = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];
  let chk = 1;
  for (const v of values) {
    const b = chk >>> 25;
    chk = (((chk & 0x1ffffff) << 5) ^ v) >>> 0;
    for (let i = 0; i < 5; i++) if ((b >>> i) & 1) chk = (chk ^ GEN[i]) >>> 0;
  }
  return chk;
}
function refSegwit(hrp: string, version: number, program: number[], spec: "bech32" | "bech32m"): string {
  // convertbits 8 -> 5 with padding, BIP 173 reference
  const data: number[] = [version];
  let acc = 0;
  let bits = 0;
  for (const v of program) {
    acc = (acc << 8) | v;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      data.push((acc >> bits) & 31);
    }
    acc &= (1 << bits) - 1;
  }
  if (bits > 0) data.push((acc << (5 - bits)) & 31);
  const exp = [...[...hrp].map((c) => c.charCodeAt(0) >> 5), 0, ...[...hrp].map((c) => c.charCodeAt(0) & 31)];
  const konst = spec === "bech32" ? 1 : 0x2bc830a3;
  const mod = (refPolymod([...exp, ...data, 0, 0, 0, 0, 0, 0]) ^ konst) >>> 0;
  const check = [0, 1, 2, 3, 4, 5].map((i) => (mod >>> (5 * (5 - i))) & 31);
  return `${hrp}1${[...data, ...check].map((d) => CS[d]).join("")}`;
}

t("verifier: Base58Check published addresses and the all-zero hash", () => {
  for (const a of [
    "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa", // genesis block coinbase
    "1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2",
    "17VZNX1SN5NtKa8UQFxwQbFeFc3iqRYhem",
    "3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy",
    "1111111111111111111114oLvT2", // version 0, hash160 all zero: 20 leading 1s
    "1BitcoinEaterAddressDontSendf59kuE",
  ]) {
    assert.ok(checkBase58Address(a), a);
  }
  assert.equal(checkBase58Address("1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa"), "P2PKH, Base58Check");
  assert.equal(checkBase58Address("3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy"), "P2SH, Base58Check");
  assert.equal(refBase58Check(0, new Uint8Array(20)), "1111111111111111111114oLvT2");
});

t("verifier: Base58Check round trip with an independent encoder, and every one-character change fails", () => {
  for (let i = 0; i < 150; i++) {
    const hash = new Uint8Array(randomBytes(20));
    if (i % 5 === 0) hash.fill(0, 0, 1 + (i % 4)); // leading zero bytes in the hash
    for (const version of [0x00, 0x05]) {
      const addr = refBase58Check(version, hash);
      assert.ok(addr.length >= 26 && addr.length <= 35, addr);
      assert.equal(checkBase58Address(addr), version === 0 ? "P2PKH, Base58Check" : "P2SH, Base58Check", addr);
      const pos = i % addr.length;
      const other = B58[(B58.indexOf(addr[pos]) + 1 + (i % 50)) % 58];
      const bad = addr.slice(0, pos) + other + addr.slice(pos + 1);
      assert.equal(checkBase58Address(bad), null, bad);
    }
  }
  // wrong version byte with a valid checksum is not a mainnet address
  assert.equal(checkBase58Address(refBase58Check(0x6f, new Uint8Array(randomBytes(20)))), null);
  // not Base58 alphabet (0, O, I, l)
  assert.equal(checkBase58Address("1A1zP1eP5QGefi2DMPTfTL5SLmv7Divf0a"), null);
});

t("verifier: BIP 173 and BIP 350 published vectors", () => {
  const valid: [string, number, number[]][] = [
    ["BC1QW508D6QEJXTDG4Y5R3ZARVARY0C5XW7KV8F3T4", 0, 20],
    ["bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4", 0, 20],
    ["bc1pw508d6qejxtdg4y5r3zarvary0c5xw7kw508d6qejxtdg4y5r3zarvary0c5xw7kt5nd6y", 1, [0x75, 0x1e]],
    ["BC1SW50QGDZ25J", 16, [0x75, 0x1e]],
    ["bc1zw508d6qejxtdg4y5r3zarvaryvaxxpcs", 2, [0x75, 0x1e]],
    ["bc1p0xlxvlhemja6c4dqv22uapctqupfhlxm9h8z3k2e72q4k9hcz7vqzk5jj0", 1, [0x79, 0xbe]],
  ].map(([a, v, n]) => [a as string, v as number, Array.isArray(n) ? n : [n as number]] as [string, number, number[]]);
  for (const [addr, version] of valid) {
    const d = decodeSegwit(addr);
    assert.ok(d, addr);
    assert.equal(d.version, version, addr);
  }
  assert.equal(decodeSegwit("bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4")!.program.length, 20);
  assert.equal(
    toHex(Uint8Array.from(decodeSegwit("BC1SW50QGDZ25J")!.program)),
    "751e",
  );
  assert.equal(toHex(Uint8Array.from(decodeSegwit("bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4")!.program)), "751e76e8199196d454941c45d1b3a323f1433bd6");
  const invalid = [
    "tb1qrp33g0q5c5txsp9arysrx4k6zdkfs4nce4xj0gdcccefvpysxf3q0sl5k7", // valid, but testnet HRP
    "bc1pw508d6qejxtdg4y5r3zarvary0c5xw7kw508d6qejxtdg4y5r3zarvary0c5xw7k7grplx", // v1 with Bech32, not Bech32m
    "BC1SW50QA3JX3S", // v16 with Bech32 (the pre BIP 350 vector)
    "BC130XLXVLHEMJA6C4DQV22UAPCTQUPFHLXM9H8Z3K2E72Q4K9HCZ7VQ7ZWS8R", // witness version 17
    "bc1gmk9yu", // empty data section
    "bc1p0xlxvlhemja6c4dqv22uapctqupfhlxm9h8z3k2e72q4k9hcz7vqh2y7hd", // Bech32 instead of Bech32m
    "BC1QR508D6QEJXTDG4Y5R3ZARVARYV98GJ9P", // 16 byte v0 program
    "bc1pw5dgrnzv", // 1 byte program
    "bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kemeawh", // Bech32m instead of Bech32
    "Bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4", // mixed case
    "bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t5", // one checksum character changed
  ];
  for (const a of invalid) assert.equal(decodeSegwit(a), null, a);
});

t("verifier: SegWit round trip against an independent encoder for versions 0 to 16", () => {
  for (let i = 0; i < 120; i++) {
    const version = i % 17;
    const len = version === 0 ? (i % 2 === 0 ? 20 : 32) : 2 + (i % 39);
    const program = [...randomBytes(len)];
    const spec = version === 0 ? "bech32" : "bech32m";
    const addr = refSegwit("bc", version, program, spec);
    const d = decodeSegwit(addr);
    assert.ok(d, addr);
    assert.equal(d.version, version);
    assert.deepEqual(d.program, program);
    assert.equal(d.encoding, spec);
    assert.ok(decodeSegwit(addr.toUpperCase()), "uppercase form is valid");
    // wrong checksum variant is rejected
    assert.equal(decodeSegwit(refSegwit("bc", version, program, version === 0 ? "bech32m" : "bech32")), null);
    // single character mutation is rejected (Bech32 detects any 4 or fewer errors)
    const pos = 3 + (i % (addr.length - 3));
    const swap = CS[(CS.indexOf(addr[pos]) + 1 + (i % 30)) % 32];
    assert.equal(decodeSegwit(addr.slice(0, pos) + swap + addr.slice(pos + 1)), null);
  }
  // program length bounds: 41 bytes is too long, 1 byte too short
  assert.equal(decodeSegwit(refSegwit("bc", 1, [...randomBytes(41)], "bech32m")), null);
  assert.equal(decodeSegwit(refSegwit("bc", 1, [1], "bech32m")), null);
  assert.equal(decodeSegwit(refSegwit("bc", 0, [...randomBytes(21)], "bech32")), null);
});

t("verifier: SegWit and legacy addresses inside prose, URI and punctuation", () => {
  const r = run("pay bitcoin:1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa?amount=1, or (BC1QW508D6QEJXTDG4Y5R3ZARVARY0C5XW7KV8F3T4). Not tb1qrp33g0q5c5txsp9arysrx4k6zdkfs4nce4xj0gdcccefvpysxf3q0sl5k7");
  assert.deepEqual(r.byType.btc.map((i) => i.value), ["1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa", "bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4"]);
  assert.equal(r.badChecksums, 0, "a testnet address is neither reported nor counted as a failed mainnet checksum");
  assert.equal(r.byType.btc[1].detail, "P2WPKH, Bech32");
});

t("verifier: SHA-256 against node:crypto over many lengths, and the million a vector", () => {
  for (let len = 0; len < 260; len++) {
    const data = randomBytes(len);
    assert.equal(toHex(sha256(new Uint8Array(data))), createHash("sha256").update(data).digest("hex"), `len ${len}`);
  }
  assert.equal(toHex(sha256(new Uint8Array(1_000_000).fill(0x61))), "cdc76e5c9914fb9281a1c7e284d73e67f1809a48a497200e046d39ccc7112cd0");
});

t("verifier: CVE ID syntax (4 to 19 digit sequence, no padding past four digits, year 1999 or later)", () => {
  const list = (s: string) => run(s).byType.cve.map((i) => i.value);
  assert.deepEqual(list("CVE-2014-0160 CVE-2017-5638 CVE-2021-44228 CVE-2024-1086"), ["CVE-2014-0160", "CVE-2017-5638", "CVE-2021-44228", "CVE-2024-1086"]);
  assert.deepEqual(list("CVE-1999-0001"), ["CVE-1999-0001"]);
  assert.deepEqual(list("CVE-1998-0001 CVE-2021-123 CVE-2021-00123 CVE-21-12345 CVE2021-12345"), []);
  assert.deepEqual(list("cve-2021-44228, Cve-2021-44228."), ["CVE-2021-44228"]);
  assert.deepEqual(list("XCVE-2021-44228 CVE-2021-44228x"), []);
  assert.deepEqual(list("CVE-2021-1234567890123456789"), ["CVE-2021-1234567890123456789"]);
  assert.deepEqual(list("CVE-2021-12345678901234567890"), []);
  assert.equal(run("CVE-2021-44228 CVE-2021-44228 cve-2021-44228").byType.cve[0].count, 3);
});

t("verifier: IPv4 boundaries", () => {
  const v4 = (s: string) => run(s).byType.ipv4.map((i) => i.value);
  assert.deepEqual(v4("0.0.0.0 255.255.255.255 1.2.3.4"), ["0.0.0.0", "255.255.255.255", "1.2.3.4"]);
  assert.deepEqual(v4("256.0.0.1 1.2.3.256 1.2.3 1.2.3.4.5 01.2.3.4 1.2.3.04 1.2.3.-4 1..2.3"), []);
  assert.deepEqual(v4("ip=203.0.113.9; next 203.0.113.10, (198.51.100.1)."), ["203.0.113.9", "203.0.113.10", "198.51.100.1"]);
  assert.deepEqual(v4("203[.]0[.]113[.]9 203(.)0(.)113(.)9 203[dot]0[dot]113[dot]9 203.0.113.9"), ["203.0.113.9"]);
  assert.equal(run("203[.]0[.]113[.]9 203(.)0(.)113(.)9 203.0.113.9").byType.ipv4[0].count, 3);
});

t("verifier: IPv6 canonical form per RFC 5952 section 4 examples", () => {
  const v6 = (s: string) => run(s).byType.ipv6.map((i) => i.value);
  assert.deepEqual(v6("2001:0db8:0000:0000:0000:0000:0000:0001"), ["2001:db8::1"]); // 4.1 leading zeros
  assert.deepEqual(v6("2001:db8:0:0:1:0:0:1"), ["2001:db8::1:0:0:1"]); // 4.2.3 first of two equal runs
  assert.deepEqual(v6("2001:0:0:1:0:0:0:1"), ["2001:0:0:1::1"]); // 4.2.3 the longer run
  assert.deepEqual(v6("2001:db8:0:1:1:1:1:1"), ["2001:db8:0:1:1:1:1:1"]); // 4.2.2 one zero group is not shortened
  assert.deepEqual(v6("2001:DB8::ABCD"), ["2001:db8::abcd"]); // 4.3 lowercase
  assert.deepEqual(v6("0:0:0:0:0:0:0:1 ::1 0000:0000:0000:0000:0000:0000:0000:0001"), ["::1"]);
  assert.deepEqual(v6("::ffff:c000:201 ::ffff:192.0.2.1"), ["::ffff:192.0.2.1"]);
  assert.deepEqual(v6("2001:db8::1 2001[:]db8[:][:]1 [2001:db8::1]:443"), ["2001:db8::1"]);
  assert.equal(run("2001:db8::1 2001[:]db8[:][:]1 2001:DB8:0:0:0:0:0:1").byType.ipv6[0].count, 3);
  // invalid forms
  assert.deepEqual(v6("2001:db8:::1 12345::1 1:2:3:4:5:6:7:8:9 1::2::3 ::g 1:2:3:4:5:6:7"), []);
  // a clock time, a MAC address and a C++ scope are not IPv6
  assert.deepEqual(v6("at 12:34:56 mac 00:1a:2b:3c:4d:5e std::vector Foo::bar"), []);
});

t("verifier: URL edges, trailing punctuation, brackets, query strings, ports", () => {
  const urls = (s: string) => run(s, { includeHosts: false }).byType.url.map((i) => i.value);
  assert.deepEqual(urls("(see https://en.wikipedia.org/wiki/Foo_(bar))."), ["https://en.wikipedia.org/wiki/Foo_(bar)"]);
  assert.deepEqual(urls("[a link](https://example.com/x) and <https://example.org/y>, \"https://example.net/z\"."), ["https://example.com/x", "https://example.org/y", "https://example.net/z"]);
  assert.deepEqual(urls("HTTP://Example.COM:8080/Path?Q=1#Frag"), ["http://example.com:8080/Path?Q=1#Frag"]);
  assert.deepEqual(urls("http://[2001:DB8:0:0:0:0:0:1]:8080/x"), ["http://[2001:db8::1]:8080/x"]);
  assert.deepEqual(urls("ftp://anon@files.example.com/pub/ and sftp://h.example.com/p"), ["ftp://anon@files.example.com/pub/", "sftp://h.example.com/p"]);
  assert.deepEqual(urls("gopher://x.example.com/ file:///etc/passwd javascript:alert(1)"), []);
  assert.deepEqual(urls("http://example.com:99999999/"), []);
  // a longer than allowed URL is not read as a URL; the host is still a domain
  const long = `http://long.example.com/${"a".repeat(9000)}`;
  const r = run(long, { includeHosts: false });
  assert.equal(r.byType.url.length, 0);
  assert.ok(r.byType.domain.some((d) => d.value === "long.example.com"));
});

t("verifier: nested URL in a query string is its own URL, and a scheme after an underscore round trips", () => {
  const r = run("hxxp://a[.]example/go?next=hxxps://evil[.]example[.]org/x&k=1", { includeHosts: false });
  assert.deepEqual(r.byType.url.map((i) => i.value), ["http://a.example/go?next=https://evil.example.org/x&k=1", "https://evil.example.org/x"]);
  const u = run("see _https://evil.example.com/p now", { includeHosts: false });
  assert.deepEqual(u.byType.url.map((i) => i.value), ["https://evil.example.com/p"]);
  // the defanged form of that URL must read back the same
  const back = run(`see _${renderValue(u.byType.url[0], "defanged")} now`, { includeHosts: false });
  assert.deepEqual(back.byType.url.map((i) => i.value), ["https://evil.example.com/p"]);
});

t("verifier: domain rules, file name TLDs, labels, case, punycode", () => {
  const doms = (s: string, o: Partial<ExtractOptions> = {}) => run(s, { includeHosts: false, ...o }).byType.domain.map((i) => i.value);
  assert.deepEqual(doms("report.pdf node.js index.html a.exe notes.txt photo.jpg data.csv e.g. i.e."), []);
  assert.deepEqual(doms("Evil.XYZ evil.xyz. (evil.xyz) evil.xyz/x"), ["evil.xyz"]);
  // a hyphen after the first label is invalid; one before the name is a dash or bullet and is dropped
  assert.deepEqual(doms("a-b.example.co.uk bad-.example.com ok.example.com"), ["a-b.example.co.uk", "ok.example.com"]);
  assert.deepEqual(doms("-bad.example.com"), ["bad.example.com"]);
  assert.deepEqual(doms(`${"a".repeat(63)}.com ${"a".repeat(64)}.com`), [`${"a".repeat(63)}.com`]);
  assert.deepEqual(doms("xn--bcher-kva.de xn--p1ai"), ["xn--bcher-kva.de"]);
  assert.deepEqual(doms("setup.py run.sh invoice.zip README.md"), []);
  assert.deepEqual(doms("setup.py run.sh invoice.zip README.md", { keepAmbiguous: true }), ["setup.py", "run.sh", "invoice.zip", "readme.md"]);
  assert.deepEqual(doms("setup[.]py"), ["setup.py"], "a defanged name was meant as a host");
  assert.deepEqual(doms("https://x.example.com/setup.py"), [], "inside a URL the name is part of the path");
  assert.deepEqual(run("mail bob@build.example.zip", { includeHosts: false }).byType.email.map((i) => i.value), ["bob@build.example.zip"], "an address is kept even when its domain ends in a file-like TLD");
  assert.deepEqual(doms("mail bob@build.example.zip", { includeHosts: true }), ["build.example.zip"]);
});

t("verifier: email edges", () => {
  const em = (s: string) => run(s, { includeHosts: false }).byType.email.map((i) => `${i.value}x${i.count}`);
  assert.deepEqual(em("Bob@Example.COM bob@example.com"), ["bob@example.comx2"]);
  assert.deepEqual(em("a.b+tag@sub.example.co.uk"), ["a.b+tag@sub.example.co.ukx1"]);
  assert.deepEqual(em("bob[@]example[.]com bob(at)example(dot)com bob{@}example{.}com"), ["bob@example.comx3"]);
  assert.deepEqual(em("bob@localhost bob@example @example.com bob@.com bob@example..com a..b@example.com"), []);
  assert.deepEqual(em("<bob@example.com>, \"bob@example.com\"; bob@example.com."), ["bob@example.comx3"]);
});

t("verifier: hashes need an exact length, hex only, mixed digits and letters", () => {
  const h = (s: string) => run(s);
  const md5 = "d41d8cd98f00b204e9800998ecf8427e";
  const sha1 = "da39a3ee5e6b4b0d3255bfef95601890afd80709";
  const sha256 = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
  const r = h(`${md5} ${sha1} ${sha256}`);
  assert.deepEqual([r.byType.md5.length, r.byType.sha1.length, r.byType.sha256.length], [1, 1, 1]);
  // one digit short or long is not a hash
  const none = h(`${md5.slice(1)} ${md5}0 ${sha1.slice(1)} ${sha1}0 ${sha256.slice(1)} ${sha256}0`);
  assert.equal(none.byType.md5.length + none.byType.sha1.length + none.byType.sha256.length, 0);
  // a 64 digit run is one SHA-256, not two MD5s
  const two = h(md5 + md5);
  assert.equal(two.byType.md5.length, 0);
  assert.equal(two.byType.sha256.length, 1);
  // non-hex character, hash glued to letters, hash in a URL path and a file name
  assert.equal(h("g41d8cd98f00b204e9800998ecf8427e z41d8cd98f00b204e9800998ecf8427e").byType.md5.length, 0);
  assert.equal(h(`https://x.example.com/f/${sha256}`).byType.sha256.length, 1);
  assert.equal(h(`sample_${md5}.bin`).byType.md5.length, 1);
});

t("verifier: CSV is RFC 4180, CRLF, quotes doubled, formula prefixes neutralized", () => {
  assert.equal(csvField("plain"), "plain");
  assert.equal(csvField("a,b"), '"a,b"');
  assert.equal(csvField('say "hi"'), '"say ""hi"""');
  assert.equal(csvField("line\nbreak"), '"line\nbreak"');
  assert.equal(csvField("=HYPERLINK(\"http://x\")"), `"'=HYPERLINK(""http://x"")"`);
  assert.equal(csvField("+1"), "'+1");
  assert.equal(csvField("-1"), "'-1");
  assert.equal(csvField("@SUM(A1)"), "'@SUM(A1)");
  const r = run("evil.example.com 203.0.113.9 -odd@example.com");
  const csv = toCsv(r.indicators, "refanged");
  assert.ok(csv.endsWith("\r\n"));
  assert.equal(csv.split("\r\n")[0], "type,value,count,first_line,written_defanged,detail");
  assert.ok(csv.includes("'-odd@example.com"), "formula guard applied to a value that starts with a minus");
  assert.ok(!/(^|[^\r])\n/.test(csv), "only CRLF line ends");
});

t("verifier: JSON export parses and carries the rendering and counts", () => {
  const r = run("hxxp://evil[.]com/a 203.0.113.9 203.0.113.9");
  const j = JSON.parse(toJson(r.indicators, "defanged"));
  assert.equal(j.rendering, "defanged");
  assert.equal(j.counts.ipv4, 1);
  const ip = j.indicators.find((x: { type: string }) => x.type === "ipv4");
  assert.equal(ip.value, "203[.]0[.]113[.]9");
  assert.equal(ip.count, 2);
  assert.equal(JSON.parse(toJson(r.indicators, "refanged")).indicators.find((x: { type: string }) => x.type === "url").value, "http://evil.com/a");
  assert.equal(toPlainLists([], "defanged"), "");
});

t("verifier: type switches and host listing", () => {
  const types = { ...allTypes(false), ipv4: true };
  const r = extractIocs("203.0.113.9 evil.com CVE-2021-44228 bob@evil.com", { types, includeHosts: true, keepAmbiguous: false });
  assert.ok(r.ok);
  assert.deepEqual(r.indicators.map((i) => i.type), ["ipv4"]);
  const hostsOnly = extractIocs("hxxp://evil[.]com/x", { types: { ...allTypes(false), domain: true }, includeHosts: true, keepAmbiguous: false });
  assert.ok(hostsOnly.ok);
  assert.deepEqual(hostsOnly.indicators.map((i) => `${i.type}:${i.value}`), ["domain:evil.com"]);
  const noHosts = extractIocs("hxxp://evil[.]com/x", { types: allTypes(), includeHosts: false, keepAmbiguous: false });
  assert.ok(noHosts.ok);
  assert.deepEqual(noHosts.indicators.map((i) => i.type), ["url"]);
});

t("verifier: unicode neighbors, CJK, emoji, RTL override, NUL and lone surrogates never throw", () => {
  for (const s of ["bücher.de", "naïve@example.com", "‮evil.com‬", "evil.com\u0000x", "\ud83d" + "evil.com" + "\ude00", "\ud800evil.com", "地址198.51.100.1", "а.com" /* Cyrillic a */]) {
    const r = extractIocs(s, opts());
    assert.ok(r.ok, JSON.stringify(s));
  }
  // No truncated "cher.de" or "ve@example.com"; the real host after the @ is still a domain.
  assert.deepEqual(run("bücher.de naïve@example.com").indicators.map((i) => `${i.type}:${i.value}`), ["domain:example.com"]);
  assert.deepEqual(run("地址198.51.100.1").byType.ipv4.map((i) => i.value), ["198.51.100.1"]);
  assert.deepEqual(run("‮evil.com‬").byType.domain.map((i) => i.value), ["evil.com"]);
});

t("verifier: limits are enforced and reported, not thrown", () => {
  const over = extractIocs("a".repeat(MAX_INPUT_CHARS + 1), opts());
  assert.equal(over.ok, false);
  if (!over.ok) assert.match(over.error, /1,000,001 characters/);
  const exact = extractIocs("a ".repeat(MAX_INPUT_CHARS / 2), opts());
  assert.ok(exact.ok);
  // more distinct indicators than the cap: counted, flagged
  let many = "";
  for (let i = 0; i < MAX_DISTINCT + 50; i++) many += `10.${(i >> 16) & 255}.${(i >> 8) & 255}.${i & 255}\n`;
  const capped = extractIocs(many, opts());
  assert.ok(capped.ok);
  assert.equal(capped.ok && capped.truncated, true);
  assert.equal(capped.ok && capped.byType.ipv4.length, MAX_DISTINCT);
});

t("verifier: a 1 MB paste of adversarial shapes finishes quickly", () => {
  const shapes = ["a.", "http://[", "a@", "1:", "::", "http://a.com/", "CVE-2021-", "[.]", "a\\.", "C:\\a\\.b", "_http://a.com_", "%2F", "hxxp:", "1.1.1.1-"];
  for (const unit of shapes) {
    const text = unit.repeat(Math.ceil(1_000_000 / unit.length)).slice(0, 1_000_000);
    const t0 = process.cpuUsage();
    const r = extractIocs(text, opts());
    const d = process.cpuUsage(t0);
    assert.ok(r.ok);
    assert.ok((d.user + d.system) / 1000 < 4000, `${unit} took ${(d.user + d.system) / 1000} ms CPU`);
  }
});


t("verifier: Windows hidden-folder paths do not become domains; emphasis underscores do not stick to URLs", () => {
  const r = run("C:\\Users\\victim\\.aws\\credentials and %USERPROFILE%\\.azure\\x and C:\\work\\.dev\\y", { includeHosts: false });
  assert.equal(r.indicators.length, 0);
  assert.deepEqual(run("evil\\.example\\.com", { includeHosts: false }).byType.domain.map((i) => i.value), ["evil.example.com"]);
  assert.deepEqual(run("_http://a.example.com_ and __http://b.example.com/x__", { includeHosts: true }).byType.url.map((i) => i.value), ["http://a.example.com", "http://b.example.com/x"]);
  assert.deepEqual(run("_http://a.example.com_", { includeHosts: true }).byType.domain.map((i) => i.value), ["a.example.com"]);
});

console.log(`ioc-extractor: ${passed} test groups passed`);
