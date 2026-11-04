import assert from "node:assert/strict";
import {
  RECIPES,
  MAX_CLAUSES,
  buildCommand,
  buildFilter,
  compileClause,
  formatIPv6,
  isBlankClause,
  newClause,
  parseAddress,
  parseIPv6,
  parseNetwork,
  shellQuote,
  type Clause,
} from "../../client/src/lib/toolkit/tcpdump-filter-builder.ts";

let passed = 0;
function test(name: string, fn: () => void) {
  try {
    fn();
  } catch (e) {
    console.error(`FAIL: ${name}`);
    throw e;
  }
  passed += 1;
}

const one = (c: Clause) => {
  const r = compileClause(c);
  if (!r.ok) throw new Error(r.error);
  return r.value;
};

test("IPv6 parsing (RFC 4291 2.2 forms)", () => {
  const v = (s: string) => {
    const r = parseIPv6(s);
    if (!r.ok) throw new Error(`${s}: ${r.error}`);
    return r.value;
  };
  assert.equal(v("::"), 0n);
  assert.equal(v("::1"), 1n);
  assert.equal(v("2001:db8::1"), (0x20010db8n << 96n) | 1n);
  assert.equal(v("2001:DB8:0:0:0:0:0:1"), v("2001:db8::1"));
  assert.equal(v("::ffff:192.0.2.1"), (0xffffn << 32n) | 0xc0000201n);
  assert.equal(v("1:2:3:4:5:6:7::"), v("1:2:3:4:5:6:7:0"));
  assert.equal(v("ffff:ffff:ffff:ffff:ffff:ffff:ffff:ffff"), (1n << 128n) - 1n);
  for (const bad of ["1::2::3", "1:2:3:4:5:6:7:8:9", "1:2:3", "12345::", "fe80::1%eth0", ":1:2:3:4:5:6:7", "1:2:3:4:5:6:7:8::", "::1.2.3.4:1", "g::1", ":::"]) {
    assert.equal(parseIPv6(bad).ok, false, bad);
  }
});

test("RFC 5952 canonical form", () => {
  const f = (s: string) => {
    const r = parseIPv6(s);
    if (!r.ok) throw new Error(r.error);
    return formatIPv6(r.value);
  };
  assert.equal(f("2001:0db8:0000:0000:0000:0000:0000:0001"), "2001:db8::1");
  assert.equal(f("0:0:0:0:0:0:0:0"), "::");
  assert.equal(f("0:0:0:0:0:0:0:1"), "::1");
  assert.equal(f("2001:db8:0:1:1:1:1:1"), "2001:db8:0:1:1:1:1:1"); // single zero group not compressed (5952 4.2.2)
  assert.equal(f("2001:0:0:1:0:0:0:1"), "2001:0:0:1::1"); // longest run (4.2.3)
  assert.equal(f("2001:db8:0:0:1:0:0:1"), "2001:db8::1:0:0:1"); // tie goes to the first run
  assert.equal(f("1::"), "1::");
});

test("address classification", () => {
  const a = (s: string) => {
    const r = parseAddress(s);
    if (!r.ok) throw new Error(r.error);
    return r.value;
  };
  assert.deepEqual(a("10.0.0.5"), { family: 4, text: "10.0.0.5" });
  assert.deepEqual(a("2001:DB8::0001"), { family: 6, text: "2001:db8::1" });
  assert.deepEqual(a("Example.COM."), { family: "name", text: "example.com" });
  assert.equal(parseAddress("10.0.0.256").ok, false);
  assert.equal(parseAddress("10.0.0").ok, false);
  assert.equal(parseAddress("tcp").ok, false);
  assert.equal(parseAddress("bad_host").ok, false);
  assert.equal(parseAddress("-lead.example").ok, false);
  assert.equal(parseAddress("a'; rm -rf /").ok, false);
  assert.equal(parseAddress("").ok, false);
});

test("networks: host bits refused like libpcap", () => {
  const n = parseNetwork("10.0.0.0/8");
  assert.ok(n.ok && n.value.text === "10.0.0.0/8" && n.value.size === "16,777,216 addresses");
  const bad = parseNetwork("10.0.0.1/8");
  assert.ok(!bad.ok && /10\.0\.0\.0\/8/.test(bad.error));
  const v6 = parseNetwork("2001:db8::/32");
  assert.ok(v6.ok && v6.value.size === "2^96 addresses");
  const v6bad = parseNetwork("2001:db8::1/64");
  assert.ok(!v6bad.ok && /2001:db8::\/64/.test(v6bad.error));
  assert.equal(parseNetwork("10.0.0.0/33").ok, false);
  assert.equal(parseNetwork("2001:db8::/129").ok, false);
  assert.equal(parseNetwork("10.0.0.0").ok, false);
  const host = parseNetwork("192.0.2.7/32");
  assert.ok(host.ok && host.value.size === "1 address");
  const all = parseNetwork("0.0.0.0/0");
  assert.ok(all.ok && all.value.size === "4,294,967,296 addresses");
});

test("host primitives (pcap-filter(7) host, src host, dst host)", () => {
  assert.equal(one(newClause("host", { value: "10.0.0.5" })).bpf, "host 10.0.0.5");
  assert.equal(one(newClause("host", { value: "10.0.0.5" })).ws, "ip.addr == 10.0.0.5");
  assert.equal(one(newClause("host", { value: "10.0.0.5", dir: "src" })).bpf, "src host 10.0.0.5");
  assert.equal(one(newClause("host", { value: "10.0.0.5", dir: "src" })).ws, "ip.src == 10.0.0.5");
  assert.equal(one(newClause("host", { value: "2001:db8::1", dir: "dst" })).bpf, "dst host 2001:db8::1");
  assert.equal(one(newClause("host", { value: "2001:db8::1", dir: "dst" })).ws, "ipv6.dst == 2001:db8::1");
  const neg = one(newClause("host", { value: "10.0.0.5", negate: true }));
  assert.equal(neg.bpf, "not host 10.0.0.5");
  assert.equal(neg.ws, "!(ip.addr == 10.0.0.5)");
  assert.match(neg.text, /^Everything except packets to or from 10\.0\.0\.5\./);
});

test("net primitives", () => {
  const c = one(newClause("net", { value: "192.168.0.0/16", dir: "dst" }));
  assert.equal(c.bpf, "dst net 192.168.0.0/16");
  assert.equal(c.ws, "ip.dst == 192.168.0.0/16");
});

test("port and portrange primitives", () => {
  const any = one(newClause("port", { value: "53" }));
  assert.equal(any.bpf, "port 53");
  assert.equal(any.ws, "tcp.port == 53 || udp.port == 53 || sctp.port == 53");
  const tcpSrc = one(newClause("port", { value: "22", transport: "tcp", dir: "src" }));
  assert.equal(tcpSrc.bpf, "tcp src port 22");
  assert.equal(tcpSrc.ws, "tcp.srcport == 22");
  const range = one(newClause("portrange", { value: "6000-6010", transport: "udp", dir: "dst" }));
  assert.equal(range.bpf, "udp dst portrange 6000-6010");
  assert.equal(range.ws, "udp.dstport in {6000..6010}");
  assert.equal(compileClause(newClause("port", { value: "65536" })).ok, false);
  assert.equal(compileClause(newClause("port", { value: "http" })).ok, false);
  assert.equal(compileClause(newClause("port", { value: "-1" })).ok, false);
  assert.equal(compileClause(newClause("portrange", { value: "100-50" })).ok, false);
  assert.equal(compileClause(newClause("portrange", { value: "100" })).ok, false);
  assert.equal(compileClause(newClause("port", { value: "0" })).ok, true);
});

test("protocol primitives", () => {
  const map: [string, string, string][] = [
    ["tcp", "tcp", "tcp"],
    ["udp", "udp", "udp"],
    ["icmp", "icmp", "icmp"],
    ["icmp6", "icmp6", "icmpv6"],
    ["arp", "arp", "arp"],
    ["ip", "ip", "ip"],
    ["ip6", "ip6", "ipv6"],
    ["vlan", "vlan", "vlan"],
  ];
  for (const [proto, bpf, ws] of map) {
    const c = one(newClause("proto", { proto: proto as Clause["proto"] }));
    assert.equal(c.bpf, bpf);
    assert.equal(c.ws, ws);
  }
  const v = one(newClause("proto", { proto: "vlan", value: "20" }));
  assert.equal(v.bpf, "vlan 20");
  assert.equal(v.ws, "vlan.id == 20");
  assert.equal(compileClause(newClause("proto", { proto: "vlan", value: "4096" })).ok, false);
});

test("TCP flag tests (header byte 13 per RFC 9293)", () => {
  const syn = one(newClause("flags", { flags: { syn: "set" } }));
  assert.equal(syn.bpf, "tcp[tcpflags] & tcp-syn != 0");
  assert.equal(syn.ws, "tcp.flags.syn == 1");
  const synOnly = one(newClause("flags", { flags: { syn: "set", ack: "clear" } }));
  assert.equal(synOnly.bpf, "tcp[tcpflags] & (tcp-syn|tcp-ack) == tcp-syn");
  assert.equal(synOnly.ws, "tcp.flags.syn == 1 && tcp.flags.ack == 0");
  assert.match(synOnly.text, /masks it with 0x12 and requires 0x02/);
  const synAck = one(newClause("flags", { flags: { syn: "set", ack: "set" } }));
  assert.equal(synAck.bpf, "tcp[tcpflags] & (tcp-syn|tcp-ack) == (tcp-syn|tcp-ack)");
  const noRst = one(newClause("flags", { flags: { rst: "clear" } }));
  assert.equal(noRst.bpf, "tcp[tcpflags] & tcp-rst == 0");
  const finPsh = one(newClause("flags", { flags: { fin: "clear", psh: "clear", urg: "clear" } }));
  assert.equal(finPsh.bpf, "tcp[tcpflags] & (tcp-fin|tcp-push|tcp-urg) == 0");
  const neg = one(newClause("flags", { flags: { syn: "set" }, negate: true }));
  assert.equal(neg.bpf, "not (tcp[tcpflags] & tcp-syn != 0)");
  assert.equal(neg.ws, "!(tcp.flags.syn == 1)");
  assert.equal(compileClause(newClause("flags", { flags: {} })).ok, false);
});

test("length tests (greater = len >=, less = len <=)", () => {
  const g = one(newClause("length", { value: "1400", lenOp: "ge" }));
  assert.equal(g.bpf, "greater 1400");
  assert.equal(g.ws, "frame.len >= 1400");
  const l = one(newClause("length", { value: "64", lenOp: "le", negate: true }));
  assert.equal(l.bpf, "not less 64");
  assert.equal(l.ws, "!(frame.len <= 64)");
  assert.equal(compileClause(newClause("length", { value: "999999" })).ok, false);
  assert.equal(compileClause(newClause("length", { value: "1e3" })).ok, false);
});

test("joining follows pcap left-to-right grouping with explicit parentheses", () => {
  const r = buildFilter([
    newClause("port", { transport: "tcp", value: "80" }),
    newClause("port", { transport: "tcp", value: "443", join: "or" }),
    newClause("host", { value: "192.0.2.10", join: "and" }),
  ]);
  assert.ok(r.ok);
  assert.equal(r.bpf, "(tcp port 80 or tcp port 443) and host 192.0.2.10");
  assert.equal(r.wireshark, "(tcp.port == 80 || tcp.port == 443) && ip.addr == 192.0.2.10");
  assert.equal(r.grouped, true);

  const flat = buildFilter([newClause("host", { value: "10.0.0.1" }), newClause("port", { value: "53", join: "and" })]);
  assert.equal(flat.bpf, "host 10.0.0.1 and port 53");
  assert.equal(flat.wireshark, "ip.addr == 10.0.0.1 && (tcp.port == 53 || udp.port == 53 || sctp.port == 53)");
  assert.equal(flat.grouped, false);

  const four = buildFilter([
    newClause("proto", { proto: "tcp" }),
    newClause("proto", { proto: "udp", join: "or" }),
    newClause("host", { value: "10.0.0.1", join: "and" }),
    newClause("proto", { proto: "arp", join: "or" }),
  ]);
  assert.equal(four.bpf, "((tcp or udp) and host 10.0.0.1) or arp");
  assert.equal(four.wireshark, "((tcp || udp) && ip.addr == 10.0.0.1) || arp");
});

test("single compound clause is not wrapped; empty list is empty", () => {
  const r = buildFilter([newClause("port", { value: "53" })]);
  assert.equal(r.wireshark, "tcp.port == 53 || udp.port == 53 || sctp.port == 53");
  const e = buildFilter([]);
  assert.ok(e.ok);
  assert.equal(e.bpf, "");
  assert.equal(e.wireshark, "");
});

test("errors are reported per clause and block the output", () => {
  const r = buildFilter([newClause("host", { value: "10.0.0.1" }), newClause("port", { value: "x1", join: "and" })]);
  assert.equal(r.ok, false);
  assert.equal(r.bpf, "");
  assert.deepEqual(r.errors.map((e) => e.index), [1]);
});

test("warnings: vlan order, nested vlan, or-ed exclusions, contradictions", () => {
  const late = buildFilter([newClause("host", { value: "10.0.0.1" }), newClause("proto", { proto: "vlan", join: "and" })]);
  assert.ok(late.warnings.some((w) => /not the first clause/.test(w)));
  const two = buildFilter([newClause("proto", { proto: "vlan", value: "10" }), newClause("proto", { proto: "vlan", value: "20", join: "or" })]);
  assert.ok(two.warnings.some((w) => /one tag deeper/.test(w)));
  const orNot = buildFilter([
    newClause("port", { value: "22", transport: "tcp", negate: true }),
    newClause("port", { value: "53", negate: true, join: "or" }),
  ]);
  assert.ok(orNot.warnings.some((w) => /join them with and/.test(w)));
  const contra = buildFilter([newClause("proto", { proto: "tcp" }), newClause("port", { value: "53", transport: "udp", join: "and" })]);
  assert.ok(contra.warnings.some((w) => /captures nothing/.test(w)));
  const fine = buildFilter([newClause("proto", { proto: "tcp" }), newClause("flags", { flags: { syn: "set" }, join: "and" })]);
  assert.equal(fine.warnings.length, 0);
});

test("empty clauses are skipped, and joins still read left to right", () => {
  assert.equal(isBlankClause(newClause("port", { value: "  " })), true);
  assert.equal(isBlankClause(newClause("proto", { proto: "vlan", value: "" })), false);
  assert.equal(isBlankClause(newClause("flags", { flags: {} })), false);
  const r = buildFilter([
    newClause("host", { value: "10.0.0.1" }),
    newClause("port", { value: "", join: "or" }),
    newClause("port", { value: "53", transport: "udp", join: "and" }),
  ]);
  assert.ok(r.ok);
  assert.deepEqual(r.skipped, [1]);
  assert.equal(r.bpf, "host 10.0.0.1 and udp port 53");
  assert.deepEqual(r.items.map((i) => i.index), [0, 2]);
  const leadBlank = buildFilter([newClause("host", { value: "" }), newClause("proto", { proto: "arp", join: "or" })]);
  assert.equal(leadBlank.bpf, "arp");
  const allBlank = buildFilter([newClause("net", { value: "" })]);
  assert.ok(allBlank.ok && allBlank.bpf === "" && allBlank.skipped.length === 1);
  const orNot = buildFilter([
    newClause("port", { value: "22", transport: "tcp", negate: true }),
    newClause("host", { value: "" }),
    newClause("port", { value: "53", negate: true, join: "or" }),
  ]);
  assert.ok(orNot.warnings.some((w) => /Clauses 1 and 3/.test(w)));
});

test("clause cap", () => {
  const many = Array.from({ length: MAX_CLAUSES + 5 }, (_, i) => newClause("port", { value: String(i + 1), join: "or" }));
  const r = buildFilter(many);
  assert.equal(r.items.length, MAX_CLAUSES);
  assert.ok(r.warnings.some((w) => /first 20/.test(w)));
});

test("recipes produce the documented filters", () => {
  const want: Record<string, [string, string]> = {
    dns: ["udp port 53 or tcp port 53", "udp.port == 53 || tcp.port == 53"],
    handshakes: ["tcp[tcpflags] & tcp-syn != 0", "tcp.flags.syn == 1"],
    "new-connections": ["tcp[tcpflags] & (tcp-syn|tcp-ack) == tcp-syn", "tcp.flags.syn == 1 && tcp.flags.ack == 0"],
    "exclude-ssh": ["not tcp port 22", "!(tcp.port == 22)"],
    resets: ["tcp[tcpflags] & tcp-rst != 0", "tcp.flags.reset == 1"],
    dhcp: ["udp portrange 67-68", "udp.port in {67..68}"],
    "web-host": ["(tcp port 80 or tcp port 443) and host 192.0.2.10", "(tcp.port == 80 || tcp.port == 443) && ip.addr == 192.0.2.10"],
    icmp: ["icmp or icmp6", "icmp || icmpv6"],
    arp: ["arp", "arp"],
    large: ["greater 1400", "frame.len >= 1400"],
    "vlan-host": ["vlan 20 and host 192.0.2.10", "vlan.id == 20 && ip.addr == 192.0.2.10"],
  };
  for (const recipe of RECIPES) {
    const r = buildFilter(recipe.clauses);
    assert.ok(r.ok, recipe.id);
    assert.deepEqual([r.bpf, r.wireshark], want[recipe.id], recipe.id);
    assert.equal(r.warnings.length, 0, `${recipe.id}: ${r.warnings.join(" ")}`);
  }
  assert.equal(RECIPES.length, Object.keys(want).length);
});

test("command builder", () => {
  const base = { sudo: true, iface: "eth0", numeric: true, snaplen: "0", count: "100", file: "capture.pcap" };
  const r = buildCommand(base, "tcp port 443");
  assert.equal(r.command, "sudo tcpdump -i eth0 -nn -s 0 -c 100 -w capture.pcap 'tcp port 443'");
  assert.equal(r.errors.length, 0);
  const bare = buildCommand({ sudo: false, iface: "", numeric: false, snaplen: "", count: "", file: "" }, "");
  assert.equal(bare.command, "tcpdump");
  const bad = buildCommand({ ...base, iface: "eth0; rm -rf /", count: "0", snaplen: "300000", file: "-oops" }, "");
  assert.equal(bad.command, "");
  assert.deepEqual(bad.errors.map((e) => e.field).sort(), ["count", "file", "iface", "snaplen"]);
  const ng = buildCommand({ ...base, file: "out.pcapng" }, "");
  assert.ok(ng.warnings.some((w) => /classic pcap/.test(w)));
  assert.equal(shellQuote("a'b"), `'a'\\''b'`);
  const anyIf = buildCommand({ ...base, iface: "any" }, "");
  assert.ok(anyIf.parts.some((p) => /promiscuous/.test(p.text)));
});

test("adversarial input never throws and never leaks quotes into the filter", () => {
  const junk = ["", " ", "'", "\"", "$(id)", "`id`", "a b", "1".repeat(5000), "::::::", "/", "10.0.0.0/", "\u0000", "🙂"];
  for (const kind of ["host", "net", "port", "portrange", "length"] as const) {
    for (const value of junk) {
      const r = buildFilter([newClause(kind, { value })]);
      if (r.ok) assert.ok(!/['"`$;]/.test(r.bpf), `${kind} ${value}`);
    }
  }
});

/* ---------------- independent verifier pass ---------------- */

// pcap-filter(7): "Negation has highest precedence. Alternation and
// concatenation have equal precedence and associate left to right."
test("verifier: man page precedence example groups left to right", () => {
  const r = buildFilter([
    newClause("host", { value: "10.0.0.1" }),
    newClause("host", { value: "10.0.0.2", join: "or" }),
    newClause("port", { value: "53", transport: "udp", join: "and" }),
  ]);
  assert.equal(r.bpf, "(host 10.0.0.1 or host 10.0.0.2) and udp port 53");
  assert.equal(r.wireshark, "(ip.addr == 10.0.0.1 || ip.addr == 10.0.0.2) && udp.port == 53");
  // not binds tighter than and: "not host a and port 80" needs no parentheses.
  const n = buildFilter([newClause("host", { value: "10.0.0.1", negate: true }), newClause("port", { value: "80", transport: "tcp", join: "and" })]);
  assert.equal(n.bpf, "not host 10.0.0.1 and tcp port 80");
  assert.equal(n.wireshark, "!(ip.addr == 10.0.0.1) && tcp.port == 80");
  // and, or, and: each change of joiner wraps everything before it.
  const z = buildFilter([
    newClause("proto", { proto: "tcp" }),
    newClause("proto", { proto: "udp", join: "and" }),
    newClause("proto", { proto: "arp", join: "or" }),
    newClause("length", { value: "100", join: "and" }),
  ]);
  assert.equal(z.bpf, "((tcp and udp) or arp) and greater 100");
});

// RFC 9293 section 3.1: FIN 0x01, SYN 0x02, RST 0x04, PSH 0x08, ACK 0x10, URG 0x20.
test("verifier: flag masks from the TCP header layout", () => {
  const finAck = one(newClause("flags", { flags: { fin: "set", ack: "set" } }));
  assert.equal(finAck.bpf, "tcp[tcpflags] & (tcp-ack|tcp-fin) == (tcp-ack|tcp-fin)");
  assert.match(finAck.text, /masks it with 0x11 and requires 0x11/);
  const clean = one(newClause("flags", { flags: { fin: "clear", rst: "clear" } }));
  assert.equal(clean.bpf, "tcp[tcpflags] & (tcp-fin|tcp-rst) == 0");
  assert.match(clean.text, /masks it with 0x05 and requires 0x00/);
  const all = one(newClause("flags", { flags: { syn: "set", ack: "set", fin: "set", rst: "set", psh: "set", urg: "set" } }));
  assert.match(all.text, /masks it with 0x3f and requires 0x3f/);
  const pshAck = one(newClause("flags", { flags: { psh: "set", ack: "set", syn: "clear" } }));
  assert.equal(pshAck.bpf, "tcp[tcpflags] & (tcp-ack|tcp-push|tcp-syn) == (tcp-ack|tcp-push)");
  assert.equal(pshAck.ws, "tcp.flags.ack == 1 && tcp.flags.push == 1 && tcp.flags.syn == 0");
  assert.match(pshAck.text, /masks it with 0x1a and requires 0x18/);
});

// RFC 5952 section 4 and 5 vectors.
test("verifier: RFC 5952 text, including IPv4-mapped mixed notation", () => {
  const f = (t: string) => {
    const r = parseIPv6(t);
    if (!r.ok) throw new Error(r.error);
    return formatIPv6(r.value);
  };
  assert.equal(f("2001:DB8::A"), "2001:db8::a");
  assert.equal(f("2001:db8:0:0:0:0:2:1"), "2001:db8::2:1");
  assert.equal(f("2001:db8::0:1"), "2001:db8::1");
  assert.equal(f("2001:db8:1:1:1:1:0:0"), "2001:db8:1:1:1:1::");
  assert.equal(f("::ffff:192.0.2.1"), "::ffff:192.0.2.1");
  assert.equal(f("0:0:0:0:0:ffff:c000:0201"), "::ffff:192.0.2.1");
  assert.equal(f("fe80::1:2"), "fe80::1:2");
  const h = one(newClause("host", { value: "::FFFF:192.0.2.1" }));
  assert.equal(h.bpf, "host ::ffff:192.0.2.1");
  assert.equal(h.ws, "ipv6.addr == ::ffff:192.0.2.1");
});

test("verifier: IPv6 networks and directions", () => {
  const n = one(newClause("net", { value: "2001:DB8::/32", dir: "dst" }));
  assert.equal(n.bpf, "dst net 2001:db8::/32");
  assert.equal(n.ws, "ipv6.dst == 2001:db8::/32");
  const bad = parseNetwork("2001:db8::1/32");
  assert.ok(!bad.ok && /2001:db8::\/32/.test(bad.error));
  const zero = parseNetwork("::/0");
  assert.ok(zero.ok && zero.value.size === "2^128 addresses");
  const src = one(newClause("port", { value: "53", dir: "src" }));
  assert.equal(src.bpf, "src port 53");
  assert.equal(src.ws, "tcp.srcport == 53 || udp.srcport == 53 || sctp.srcport == 53");
});

test("verifier: value boundaries", () => {
  const ok = (c: Clause) => compileClause(c).ok;
  assert.equal(ok(newClause("port", { value: "65535" })), true);
  assert.equal(ok(newClause("port", { value: " 0 " })), true);
  assert.equal(ok(newClause("port", { value: "99999999999" })), false);
  assert.equal(ok(newClause("portrange", { value: "0-65535" })), true);
  assert.equal(ok(newClause("portrange", { value: "1 - 2" })), true);
  assert.equal(ok(newClause("portrange", { value: "1-65536" })), false);
  assert.equal(ok(newClause("proto", { proto: "vlan", value: "0" })), true);
  assert.equal(ok(newClause("proto", { proto: "vlan", value: "4095" })), true);
  assert.equal(ok(newClause("proto", { proto: "vlan", value: "-1" })), false);
  assert.equal(ok(newClause("length", { value: "0" })), true);
  assert.equal(ok(newClause("length", { value: "262144" })), true);
  assert.equal(ok(newClause("length", { value: "262145" })), false);
  assert.equal(ok(newClause("length", { value: "１００" })), false); // full-width digits
});

test("verifier: hostnames the pcap lexer would misread", () => {
  for (const bad of ["len", "less", "gateway", "tcp-syn", "icmp-echo", "icmp6-echo", "aabbccddeeff", "0x0a", "aabb.ccdd.eeff", "10.1", "localhost_"]) {
    assert.equal(parseAddress(bad).ok, false, bad);
  }
  for (const good of ["router-1.lan", "db01.example.net", "1e100.net", "localhost"]) {
    assert.equal(parseAddress(good).ok, true, good);
  }
  const named = one(newClause("host", { value: "db01.example.net", dir: "src" }));
  assert.equal(named.bpf, "src host db01.example.net");
  assert.equal(named.ws, "ip.src == db01.example.net");
});

test("verifier: contradictory and-chains are flagged, satisfiable ones are not", () => {
  const warns = (cs: Clause[]) => buildFilter(cs).warnings.filter((w) => /captures nothing/.test(w));
  // tcp[] offsets only exist over IPv4.
  assert.equal(warns([newClause("proto", { proto: "ip6" }), newClause("flags", { flags: { syn: "set" }, join: "and" })]).length, 1);
  assert.equal(warns([newClause("host", { value: "2001:db8::1" }), newClause("flags", { flags: { syn: "set" }, join: "and" })]).length, 1);
  // icmp is IPv4 only; icmp6 is IPv6 only.
  assert.equal(warns([newClause("proto", { proto: "icmp" }), newClause("proto", { proto: "ip6", join: "and" })]).length, 1);
  assert.equal(warns([newClause("proto", { proto: "icmp6" }), newClause("host", { value: "10.0.0.1", join: "and" })]).length, 1);
  // ARP has no ports.
  assert.equal(warns([newClause("proto", { proto: "arp" }), newClause("port", { value: "53", join: "and" })]).length, 1);
  assert.equal(warns([newClause("proto", { proto: "tcp" }), newClause("port", { value: "53", transport: "udp", join: "and" })]).length, 1);
  // Satisfiable.
  assert.equal(warns([newClause("proto", { proto: "arp" }), newClause("host", { value: "10.0.0.1", join: "and" })]).length, 0);
  assert.equal(warns([newClause("proto", { proto: "icmp6" }), newClause("net", { value: "2001:db8::/32", join: "and" })]).length, 0);
  assert.equal(warns([newClause("proto", { proto: "ip" }), newClause("flags", { flags: { rst: "set" }, join: "and" })]).length, 0);
  assert.equal(warns([newClause("host", { value: "example.com" }), newClause("proto", { proto: "ip6", join: "and" })]).length, 0);
  // Negated clauses and or-chains are not treated as constraints.
  assert.equal(warns([newClause("proto", { proto: "tcp" }), newClause("proto", { proto: "udp", negate: true, join: "and" })]).length, 0);
  assert.equal(warns([newClause("proto", { proto: "tcp" }), newClause("proto", { proto: "udp", join: "or" })]).length, 0);
  const msg = warns([newClause("proto", { proto: "arp" }), newClause("port", { value: "53", join: "and" })])[0];
  assert.match(msg, /arp \(clause 1\) and port 53 \(clause 2\)/);
});

test("verifier: command options at their limits", () => {
  const base = { sudo: false, iface: "any", numeric: true, snaplen: "", count: "", file: "" };
  assert.equal(buildCommand({ ...base, count: "2147483647" }, "").command, "tcpdump -i any -nn -c 2147483647");
  assert.equal(buildCommand({ ...base, count: "2147483648" }, "").command, "");
  assert.equal(buildCommand({ ...base, snaplen: "262144" }, "").command, "tcpdump -i any -nn -s 262144");
  assert.equal(buildCommand({ ...base, file: "~/caps/web.pcap" }, "port 80").command, "tcpdump -i any -nn -w ~/caps/web.pcap 'port 80'");
  for (const file of ["a b.pcap", "x;y", "$(id).pcap", "a\nb", "-w"]) {
    assert.equal(buildCommand({ ...base, file }, "").command, "", file);
  }
  for (const iface of ["eth0 ", " en0", "wlan0mon", "eth0.100", "br-1a2b"]) {
    assert.ok(buildCommand({ ...base, iface }, "").command.includes(`-i ${iface.trim()}`), iface);
  }
  for (const iface of ["eth0|x", "`id`", "-D", "é0"]) {
    assert.equal(buildCommand({ ...base, iface }, "").command, "", iface);
  }
});

test("verifier: error messages stay short for huge input", () => {
  const big = "1".repeat(100000);
  for (const kind of ["host", "net", "port", "portrange", "length"] as const) {
    for (const value of [big, `${big}/8`, `10.0.0.0/${big}`, `a${big}`, `${big}.1`]) {
      const r = compileClause(newClause(kind, { value }));
      if (!r.ok) assert.ok(r.error.length < 300, `${kind}: ${r.error.slice(0, 60)}`);
    }
  }
  const cmd = buildCommand({ sudo: false, iface: "", numeric: false, snaplen: big, count: `x${big}`, file: "" }, "");
  for (const e of cmd.errors) assert.ok(e.message.length < 300, e.message.slice(0, 60));
});

console.log(`tcpdump-filter-builder (with verifier pass): ${passed} tests passed`);
