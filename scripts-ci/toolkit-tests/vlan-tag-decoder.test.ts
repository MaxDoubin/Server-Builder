import assert from "node:assert/strict";
import {
  buildTag,
  buildTci,
  bytesToHex,
  decodeInput,
  describeType,
  linuxCommandBlocker,
  linuxCommands,
  parseHexBytes,
  parseVid,
  splitTci,
  tciBits,
  tcpdumpFilter,
  validLinuxIface,
  PCP_TABLE,
  MAX_INPUT_CHARS,
} from "../../client/src/lib/toolkit/vlan-tag-decoder.ts";

let passed = 0;
function t(name: string, fn: () => void) {
  try {
    fn();
  } catch (err) {
    console.error(`FAIL: ${name}`);
    throw err;
  }
  passed++;
}

function ok(raw: string) {
  const d = decodeInput(raw);
  if (d.kind !== "ok") throw new Error(`expected ok for ${raw}, got ${JSON.stringify(d)}`);
  return d;
}

/* ------------------------------------------------------------- TCI bits */
t("TCI 0xA064: PCP 5, DEI 0, VID 100", () => {
  const f = splitTci(0xa064);
  assert.equal(f.pcp, 5);
  assert.equal(f.dei, 0);
  assert.equal(f.vid, 100);
  assert.equal(f.pcpInfo.code, "VO");
});

t("TCI 0xFFFF: PCP 7, DEI 1, VID 4095", () => {
  const f = splitTci(0xffff);
  assert.deepEqual([f.pcp, f.dei, f.vid], [7, 1, 4095]);
});

t("TCI 0x1000: DEI only", () => {
  const f = splitTci(0x1000);
  assert.deepEqual([f.pcp, f.dei, f.vid], [0, 1, 0]);
});

t("TCI 0xE000: PCP 7, VID 0", () => {
  assert.deepEqual([splitTci(0xe000).pcp, splitTci(0xe000).vid], [7, 0]);
});

t("PCP table matches 802.1Q Annex I", () => {
  assert.deepEqual(
    PCP_TABLE.map((p) => p.code),
    ["BE", "BK", "EE", "CA", "VI", "VO", "IC", "NC"],
  );
});

t("buildTci round trips for every PCP, DEI and a spread of VIDs", () => {
  for (let pcp = 0; pcp < 8; pcp++) {
    for (const dei of [false, true]) {
      for (const vid of [0, 1, 2, 100, 1002, 2048, 4094, 4095]) {
        const f = splitTci(buildTci(pcp, dei, vid));
        assert.deepEqual([f.pcp, f.dei, f.vid], [pcp, dei ? 1 : 0, vid]);
      }
    }
  }
});

t("tciBits groups 3 / 1 / 12", () => {
  assert.deepEqual(tciBits(0xa064), { pcp: "101", dei: "0", vid: "000001100100" });
});

/* ------------------------------------------------------------ building */
t("build C-tag PCP 5 VID 100 -> 81 00 a0 64", () => {
  assert.equal(bytesToHex(buildTag({ tpid: 0x8100, pcp: 5, dei: false, vid: 100 })), "81 00 a0 64");
});

t("build S-tag VID 100 -> 88 a8 00 64", () => {
  assert.equal(bytesToHex(buildTag({ tpid: 0x88a8, pcp: 0, dei: false, vid: 100 })), "88 a8 00 64");
});

t("build PCP 3 DEI VID 4094 -> 81 00 7f fe", () => {
  assert.equal(bytesToHex(buildTag({ tpid: 0x8100, pcp: 3, dei: true, vid: 4094 })), "81 00 7f fe");
});

t("parseVid", () => {
  assert.deepEqual(parseVid("100"), { ok: true, vid: 100 });
  assert.deepEqual(parseVid("0"), { ok: true, vid: 0 });
  assert.deepEqual(parseVid("4095"), { ok: true, vid: 4095 });
  assert.equal(parseVid("4096").ok, false);
  assert.equal(parseVid("").ok, false);
  assert.equal(parseVid("-1").ok, false);
  assert.equal(parseVid("1e3").ok, false);
  assert.equal(parseVid("9".repeat(500)).ok, false);
});

/* ------------------------------------------------------------- parsing */
t("hex input shapes", () => {
  const want = [0x81, 0x00, 0xa0, 0x64];
  for (const s of ["81 00 a0 64", "8100a064", "0x8100a064", "81:00:A0:64", "8100.a064", "\\x81\\x00\\xa0\\x64", "0x81 0x00 0xa0 0x64", "81 0 a0 64", "81-00-a0-64", "  8100 A064\n"]) {
    const p = parseHexBytes(s);
    assert.equal(p.kind, "ok", s);
    if (p.kind === "ok") assert.deepEqual(p.bytes, want, s);
  }
});

t("hex errors", () => {
  assert.equal(parseHexBytes("").kind, "empty");
  assert.equal(parseHexBytes("   ").kind, "empty");
  const odd = parseHexBytes("8100a06");
  assert.equal(odd.kind, "error");
  const bad = parseHexBytes("81 00 g0 64");
  assert.equal(bad.kind, "error");
  if (bad.kind === "error") assert.ok(bad.message.includes('"g"'));
  assert.equal(parseHexBytes("x".repeat(MAX_INPUT_CHARS + 1)).kind, "error");
  assert.equal(parseHexBytes("0x").kind, "error");
  assert.equal(parseHexBytes(":::").kind, "error");
});

/* ------------------------------------------------------------- decoding */
t("decode one C-tag", () => {
  const d = ok("81 00 a0 64");
  assert.equal(d.mode, "tag");
  assert.equal(d.tags[0].tpid, 0x8100);
  assert.equal(d.tags[0].tpidInfo?.short, "C-tag");
  assert.equal(d.tags[0].fields.vid, 100);
  assert.equal(d.tags[0].fields.pcp, 5);
});

t("decode flags VID 0 and VID 4095", () => {
  assert.equal(ok("81 00 60 00").tags[0].findings.at(-1)?.tone, "warn");
  assert.ok(ok("81 00 60 00").tags[0].findings.some((f) => f.text.includes("priority tagged")));
  assert.ok(ok("81 00 0f ff").tags[0].findings.some((f) => f.tone === "danger" && f.text.includes("4095")));
});

t("decode a non-TPID explains the EtherType", () => {
  const d = ok("08 00 45 00");
  assert.equal(d.tags[0].tpidInfo, null);
  assert.ok(d.tags[0].findings[0].text.includes("IPv4"));
  assert.equal(d.tags[0].findings[0].tone, "danger");
});

t("describeType ranges", () => {
  assert.ok(describeType(0x05dc).includes("length"));
  assert.ok(describeType(0x0040).includes("length"));
  assert.ok(describeType(0x05dd).includes("undefined"));
  assert.ok(describeType(0x86dd).includes("IPv6"));
  assert.ok(describeType(0x1234).includes("does not name"));
});

t("decode a QinQ pair", () => {
  const d = ok("88 a8 00 64 81 00 00 c8");
  assert.equal(d.mode, "pair");
  assert.equal(d.tags.length, 2);
  assert.equal(d.tags[0].fields.vid, 100);
  assert.equal(d.tags[1].fields.vid, 200);
  assert.equal(d.tags[1].offset, 4);
  assert.equal(d.stack[0].tone, "ok");
});

t("double 802.1Q warns about VLAN hopping", () => {
  const d = ok("81 00 00 01 81 00 00 14");
  assert.ok(d.stack[0].text.includes("hopping"));
});

t("C-tag outside S-tag warns", () => {
  assert.ok(ok("81 00 00 64 88 a8 00 c8").stack[0].text.includes("backwards"));
});

t("8 bytes of one tag plus EtherType decodes one tag", () => {
  const d = ok("81 00 00 64 08 00 45 00");
  assert.equal(d.tags.length, 1);
  assert.ok(d.stack[0].text.includes("IPv4"));
});

t("bare TCI", () => {
  const d = ok("a064");
  assert.equal(d.mode, "tci");
  assert.equal(d.tags[0].tpid, null);
  assert.equal(d.tags[0].fields.vid, 100);
});

t("legacy 0x9100 outer tag", () => {
  const d = ok("91 00 00 0a 81 00 00 14");
  assert.equal(d.tags[0].tpidInfo?.short, "Legacy QinQ");
  assert.ok(d.stack[0].text.includes("Pre-standard"));
});

t("frame mode: ARP broadcast on VLAN 100", () => {
  const d = ok("ff ff ff ff ff ff 02 00 00 00 00 01 81 00 00 64 08 06");
  assert.equal(d.mode, "frame");
  assert.equal(d.frame?.dst, "ff:ff:ff:ff:ff:ff");
  assert.equal(d.frame?.src, "02:00:00:00:00:01");
  assert.equal(d.frame?.etherType, 0x0806);
  assert.ok(d.frame?.etherTypeName?.includes("ARP"));
  assert.equal(d.tags[0].offset, 12);
});

t("frame mode: QinQ frame", () => {
  const d = ok("ffffffffffff020000000001 88a8 0064 8100 00c8 86dd 6000");
  assert.equal(d.tags.length, 2);
  assert.equal(d.frame?.etherType, 0x86dd);
});

t("frame mode: untagged frame is an error naming the EtherType", () => {
  const d = decodeInput("ff ff ff ff ff ff 02 00 00 00 00 01 08 00 45 00");
  assert.equal(d.kind, "error");
  if (d.kind === "error") assert.ok(d.message.includes("IPv4"));
});

t("frame mode: tag cap", () => {
  const d = ok("ffffffffffff020000000001" + "81000001".repeat(6) + "0800");
  assert.equal(d.tags.length, 4);
  assert.ok(d.stack.some((f) => f.text.includes("Stopped after 4")));
});

t("frame mode: input ends after the tag", () => {
  const d = ok("ffffffffffff020000000001 8100 0064");
  assert.equal(d.frame?.etherType, null);
});

t("wrong lengths are errors", () => {
  for (const s of ["81", "81 00 a0", "81 00 a0 64 81", "81 00 a0 64 81 00 a0 64 81 00", "00".repeat(13)]) {
    assert.equal(decodeInput(s).kind, "error", s);
  }
});

t("adversarial input never throws", () => {
  for (const s of ["\u0000", "🙂🙂", "0x0x0x", "-".repeat(4000), "ab".repeat(2000), "\\x", "8100 a064 ".repeat(300)]) {
    decodeInput(s);
  }
});

/* ------------------------------------------------------------- commands */
t("linux commands", () => {
  assert.equal(
    linuxCommands("eth0", { tpid: 0x8100, pcp: 0, dei: false, vid: 100 }, null),
    "ip link add link eth0 name eth0.100 type vlan id 100",
  );
  assert.equal(
    linuxCommands("eth0", { tpid: 0x8100, pcp: 5, dei: false, vid: 100 }, null),
    "ip link add link eth0 name eth0.100 type vlan id 100 egress-qos-map 0:5",
  );
  assert.equal(
    linuxCommands("eth0", { tpid: 0x88a8, pcp: 0, dei: false, vid: 100 }, { tpid: 0x8100, pcp: 0, dei: false, vid: 200 }),
    "ip link add link eth0 name eth0.100 type vlan protocol 802.1ad id 100\nip link add link eth0.100 name eth0.100.200 type vlan id 200",
  );
  assert.equal(linuxCommands("eth0", { tpid: 0x9100, pcp: 0, dei: false, vid: 1 }, null), null);
});

t("linux names stay within 15 characters", () => {
  const c = linuxCommands("enp0s31f6", { tpid: 0x88a8, pcp: 0, dei: false, vid: 4094 }, { tpid: 0x8100, pcp: 0, dei: false, vid: 4094 });
  assert.ok(c);
  for (const m of c!.matchAll(/name (\S+)/g)) assert.ok(m[1].length <= 15, m[1]);
  assert.ok(validLinuxIface("enp0s31f6"));
  assert.ok(!validLinuxIface("eth0 ; reboot"));
});

t("tcpdump filter", () => {
  assert.equal(tcpdumpFilter({ tpid: 0x8100, pcp: 0, dei: false, vid: 100 }, null), "vlan 100");
  assert.equal(
    tcpdumpFilter({ tpid: 0x88a8, pcp: 0, dei: false, vid: 100 }, { tpid: 0x8100, pcp: 0, dei: false, vid: 200 }),
    "vlan 100 and vlan 200",
  );
});

/* ------------------------------------------- independent verifier cases */
t("verifier: hand-derived TCIs", () => {
  // 0x2001 = 001 0 000000000001
  assert.deepEqual([splitTci(0x2001).pcp, splitTci(0x2001).dei, splitTci(0x2001).vid, splitTci(0x2001).pcpInfo.code], [1, 0, 1, "BK"]);
  // 0x3064 = 001 1 000001100100
  assert.deepEqual([splitTci(0x3064).pcp, splitTci(0x3064).dei, splitTci(0x3064).vid], [1, 1, 100]);
  // 0xE00A = 111 0 000000001010
  assert.deepEqual([splitTci(0xe00a).pcp, splitTci(0xe00a).vid, splitTci(0xe00a).pcpInfo.code], [7, 10, "NC"]);
  // 0x0FFE: VID 4094, the highest usable
  assert.deepEqual([splitTci(0x0ffe).pcp, splitTci(0x0ffe).dei, splitTci(0x0ffe).vid], [0, 0, 4094]);
  // 0x8000: PCP 4 (video), VID 0
  assert.deepEqual([splitTci(0x8000).pcp, splitTci(0x8000).vid, splitTci(0x8000).pcpInfo.name], [4, 0, "Video"]);
});

t("verifier: build S-tag PCP 4, DEI, VID 4094 -> 88 a8 9f fe", () => {
  // (4 << 13) | (1 << 12) | 0xffe = 0x8000 | 0x1000 | 0x0ffe = 0x9ffe
  assert.equal(bytesToHex(buildTag({ tpid: 0x88a8, pcp: 4, dei: true, vid: 4094 })), "88 a8 9f fe");
  assert.equal(bytesToHex(buildTag({ tpid: 0x9100, pcp: 7, dei: false, vid: 1 })), "91 00 e0 01");
});

t("verifier: VID findings for 1, 1002, 1005, 1006, 4094", () => {
  assert.ok(ok("81 00 00 01").tags[0].findings.some((f) => f.text.includes("native")));
  assert.ok(ok("81 00 03 ea").tags[0].findings.some((f) => f.text.includes("1002 to 1005")));
  assert.ok(ok("81 00 03 ed").tags[0].findings.some((f) => f.text.includes("1002 to 1005")));
  assert.equal(ok("81 00 03 ee").tags[0].findings.at(-1)?.tone, "ok");
  assert.equal(ok("81 00 0f fe").tags[0].findings.at(-1)?.tone, "ok");
  assert.equal(ok("ffff").tags[0].findings.at(-1)?.tone, "danger");
});

t("verifier: Length/Type boundaries (802.3 clause 3.2.6)", () => {
  assert.ok(describeType(1500).includes("length field (1500 bytes)"));
  assert.ok(describeType(0x05ff).includes("undefined"));
  assert.ok(!describeType(0x0600).includes("undefined"));
  assert.ok(!describeType(0x0600).includes("length"));
  assert.ok(describeType(0x88cc).includes("LLDP"));
});

t("verifier: one tag then a length field never claims the frame is untagged", () => {
  const d = ok("81 00 00 64 00 40 aa aa");
  assert.equal(d.tags.length, 1);
  assert.ok(d.stack[0].text.includes("length field (64 bytes)"));
  assert.ok(!d.stack[0].text.includes("untagged"));
});

t("verifier: frame cut off inside the first tag is reported as a cut tag, not as untagged", () => {
  for (const s of ["ffffffffffff020000000001 8100", "ffffffffffff020000000001 88a8 00"]) {
    const d = decodeInput(s);
    assert.equal(d.kind, "error", s);
    if (d.kind === "error") {
      assert.ok(d.message.includes("TPID"), d.message);
      assert.ok(!d.message.includes("no VLAN tag"), d.message);
    }
  }
});

t("verifier: frame cut off inside a second tag warns", () => {
  const d = ok("ffffffffffff020000000001 88a8 0064 8100");
  assert.equal(d.tags.length, 1);
  assert.ok(d.stack.some((f) => f.tone === "warn" && f.text.includes("byte 17")));
  assert.equal(d.frame?.etherType, null);
});

t("verifier: exactly 4 tags then an EtherType is not reported as truncated", () => {
  const d = ok("ffffffffffff020000000001" + "88a80001" + "81000002".repeat(3) + "0800");
  assert.equal(d.tags.length, 4);
  assert.ok(!d.stack.some((f) => f.text.includes("Stopped")));
  assert.equal(d.frame?.etherType, 0x0800);
});

t("verifier: input length cap is inclusive at 4096", () => {
  assert.equal(parseHexBytes("8100a064" + " ".repeat(MAX_INPUT_CHARS - 8)).kind, "ok");
  assert.equal(parseHexBytes("8100a064" + " ".repeat(MAX_INPUT_CHARS - 7)).kind, "error");
});

t("verifier: non-hex messages keep astral characters whole", () => {
  const p = parseHexBytes("81 00 \u{1F642} 64");
  assert.equal(p.kind, "error");
  if (p.kind === "error") assert.ok(p.message.startsWith('"\u{1F642}"'), p.message);
  const q = parseHexBytes("\uff18\uff11\uff10\uff10");
  assert.equal(q.kind, "error");
});

t("verifier: QinQ commands carry both PCP values", () => {
  assert.equal(
    linuxCommands("eth0", { tpid: 0x88a8, pcp: 5, dei: false, vid: 100 }, { tpid: 0x8100, pcp: 3, dei: false, vid: 200 }),
    "ip link add link eth0 name eth0.100 type vlan protocol 802.1ad id 100 egress-qos-map 0:5\nip link add link eth0.100 name eth0.100.200 type vlan id 200 egress-qos-map 0:3",
  );
});

t("verifier: no ip link command for VID 4095 or a 0x9100 tag, with a reason", () => {
  const r = { tpid: 0x8100, pcp: 0, dei: false, vid: 4095 };
  assert.equal(linuxCommands("eth0", r, null), null);
  assert.ok(linuxCommandBlocker(r, null)?.includes("4095"));
  const s = { tpid: 0x88a8, pcp: 0, dei: false, vid: 10 };
  assert.equal(linuxCommands("eth0", s, r), null);
  assert.ok(linuxCommandBlocker({ tpid: 0x9100, pcp: 0, dei: false, vid: 10 }, null)?.includes("0x9100"));
  assert.equal(linuxCommandBlocker(s, { tpid: 0x8100, pcp: 0, dei: false, vid: 0 }), null);
});

t("verifier: every built pair decodes back to the same fields", () => {
  for (const tpid of [0x8100, 0x88a8, 0x9100]) {
    for (const vid of [0, 1, 4094, 4095]) {
      for (let pcp = 0; pcp < 8; pcp++) {
        const bytes = [...buildTag({ tpid, pcp, dei: pcp % 2 === 1, vid }), ...buildTag({ tpid: 0x8100, pcp: 7 - pcp, dei: false, vid: 4094 - vid })];
        const d = ok(bytesToHex(bytes));
        assert.equal(d.mode, "pair");
        assert.deepEqual([d.tags[0].tpid, d.tags[0].fields.pcp, d.tags[0].fields.dei, d.tags[0].fields.vid], [tpid, pcp, pcp % 2, vid]);
        assert.equal(d.tags[1].fields.vid, (4094 - vid) & 0xfff);
      }
    }
  }
});

console.log(`vlan-tag-decoder: ${passed} tests passed`);
