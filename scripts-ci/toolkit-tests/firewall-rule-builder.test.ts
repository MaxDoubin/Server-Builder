import assert from "node:assert/strict";
import {
  DEFAULT_BASELINE,
  DEFAULT_RULE,
  buildBaseline,
  buildRule,
  checkComment,
  checkIface,
  checkLogPrefix,
  checkZone,
  formatV6,
  parseAddress,
  parsePorts,
  type RuleSpec,
  type ToolId,
} from "../../client/src/lib/toolkit/firewall-rule-builder.ts";

let count = 0;
function eq<T>(a: T, b: T, msg?: string) {
  assert.deepStrictEqual(a, b, msg);
  count += 1;
}
function ok(v: unknown, msg?: string) {
  assert.ok(v, msg);
  count += 1;
}

const rule = (patch: Partial<RuleSpec>): RuleSpec => ({ ...DEFAULT_RULE, sudo: false, comment: "", ...patch });
const out = (spec: RuleSpec, tool: ToolId) => {
  const r = buildRule(spec);
  assert.ok(r.ok, JSON.stringify(r.errors));
  const o = r.outputs.find((x) => x.tool === tool);
  assert.ok(o);
  return o;
};
const cmds = (spec: RuleSpec, tool: ToolId) => out(spec, tool).commands.filter((c) => !c.startsWith("#"));

/* ---------------------------------------------------------- addresses */

const a = (s: string) => {
  const r = parseAddress(s);
  assert.ok(r.ok, s);
  return r.value;
};
const aerr = (s: string) => {
  const r = parseAddress(s);
  assert.ok(!r.ok, `${s} should be rejected`);
  return r.error;
};

eq(a(""), null);
eq(a("any"), null);
eq(a("ANY"), null);
eq(a("10.0.0.5")?.text, "10.0.0.5");
eq(a("10.0.0.5/32")?.text, "10.0.0.5");
eq(a("10.0.0.0/24")?.text, "10.0.0.0/24");
eq(a("10.0.0.0/24")?.normalized, false);
eq(a("10.0.0.5/24")?.text, "10.0.0.0/24");
eq(a("10.0.0.5/24")?.normalized, true);
eq(a("192.168.1.130/25")?.text, "192.168.1.128/25");
eq(a("0.0.0.0/0")?.text, "0.0.0.0/0");
eq(a("255.255.255.255")?.text, "255.255.255.255");
eq(a("203.0.113.77/31")?.text, "203.0.113.76/31");
eq(a("10.0.0.0/8")?.family, "ipv4");
ok(aerr("10.0.0").includes("four"));
ok(aerr("10.0.0.256").includes("0 to 255"));
ok(aerr("10.0.0.01").includes("leading zero"));
ok(aerr("10.0.0.0/33").includes("0 to 32"));
ok(aerr("10.0.0.0/").includes("prefix"));
ok(aerr("10.0.0.0/08").includes("prefix"));
ok(aerr("10.0.0.0/8/9").includes("one /"));
ok(aerr("10.0.0.1,10.0.0.2").includes("One address"));
ok(aerr("example.com").includes("numeric"));
ok(aerr("10.0.0.1; rm -rf /").length > 0);
ok(aerr("x".repeat(5000)).includes("too long"));

// IPv6, RFC 4291 text forms in, RFC 5952 canonical text out.
eq(a("2001:db8::1")?.text, "2001:db8::1");
eq(a("2001:DB8:0:0:0:0:0:1")?.text, "2001:db8::1");
eq(a("2001:0db8:0000:0000:0001:0000:0000:0001")?.text, "2001:db8::1:0:0:1"); // RFC 5952 4.2.3: first longest run
eq(a("2001:db8:0:1:1:1:1:1")?.text, "2001:db8:0:1:1:1:1:1"); // RFC 5952 4.2.2: a single 0 is not compressed
eq(a("2001:db8::/32")?.text, "2001:db8::/32");
eq(a("2001:db8:1234::1/32")?.text, "2001:db8::/32");
eq(a("2001:db8:1234::1/32")?.normalized, true);
eq(a("::")?.text, "::");
eq(a("::1")?.text, "::1");
eq(a("fe80::/10")?.text, "fe80::/10");
eq(a("::/0")?.text, "::/0");
eq(a("::ffff:192.0.2.1")?.text, "::ffff:192.0.2.1");
eq(a("::ffff:192.0.2.1")?.mapped, true);
eq(a("2001:db8::1")?.mapped, false);
eq(a("64:ff9b::192.0.2.33")?.text, "64:ff9b::c000:221");
ok(aerr("2001:db8::1::2").includes("only once"));
ok(aerr("2001:db8::1%eth0").includes("zone"));
ok(aerr("2001:db8:1:2:3:4:5:6:7").includes("eight"));
ok(aerr("2001:db8::/129").includes("0 to 128"));
ok(aerr("2001:db8::g").length > 0);
ok(aerr("1:2:3:4:5:6:7::8").includes("too many"));
eq(formatV6(0n), "::");
eq(formatV6(1n), "::1");
eq(formatV6((1n << 128n) - 1n), "ffff:ffff:ffff:ffff:ffff:ffff:ffff:ffff");

/* -------------------------------------------------------------- ports */

const p = (s: string) => {
  const r = parsePorts(s);
  assert.ok(r.ok, s);
  return r.value;
};
const perr = (s: string) => {
  const r = parsePorts(s);
  assert.ok(!r.ok, `${s} should be rejected`);
  return r.error;
};
eq(p(""), null);
eq(p("22")?.items, [{ lo: 22, hi: 22 }]);
eq(p("80, 443")?.items, [
  { lo: 80, hi: 80 },
  { lo: 443, hi: 443 },
]);
eq(p("6000-6010")?.items, [{ lo: 6000, hi: 6010 }]);
eq(p("6000:6010")?.items, [{ lo: 6000, hi: 6010 }]);
eq(p("53-53")?.items, [{ lo: 53, hi: 53 }]);
eq(p("1-65535")?.slots, 2);
eq(p("22,22,22")?.items.length, 1);
eq(p("1,2,3,4,5,6,7,8,9,10,11,12,13,14,15")?.slots, 15);
ok(perr("1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16").includes("15"));
ok(perr("1,2,3,4,5,6,7,8,9,10,11,12,13,14,15-20").includes("16 slots"));
eq(p("1,2,3,4,5,6,7,8,9,10,11,12,13,14-20")?.slots, 15);
ok(perr("0").includes("1 to 65535"));
ok(perr("65536").includes("1 to 65535"));
ok(perr("443-80").includes("backwards"));
ok(perr("80,,443").includes("empty"));
ok(perr("http").includes("not a port"));
ok(perr("22; reboot").includes("not a port"));

/* -------------------------------------------------------- text fields */

eq(checkIface("eth0"), { ok: true, value: "eth0" });
eq(checkIface(""), { ok: true, value: null });
ok(!checkIface("eth+").ok);
ok(!checkIface("eth0:1").ok);
ok(!checkIface("averyveryverylongname").ok);
ok(!checkIface("eth0 -j ACCEPT").ok);
ok(!checkIface("..").ok);
eq(checkIface("wg0.100"), { ok: true, value: "wg0.100" });
ok(checkComment("SSH from management").ok);
ok(!checkComment('say "hi"').ok);
ok(!checkComment("it's").ok);
ok(!checkComment("$(reboot)").ok);
ok(!checkComment("`id`").ok);
ok(!checkComment("café").ok);
ok(!checkComment("x".repeat(129)).ok);
ok(checkComment("x".repeat(128)).ok);
ok(checkLogPrefix("ssh-drop:").ok);
ok(!checkLogPrefix("x".repeat(29)).ok);
ok(checkLogPrefix("x".repeat(28)).ok);
ok(!checkLogPrefix('a"b').ok);
eq(checkZone(""), { ok: true, value: "public" });
ok(!checkZone("a".repeat(18)).ok);
ok(!checkZone("pub lic").ok);

/* ------------------------------------------- default rule, all four tools */

const def = rule({});
eq(cmds(def, "iptables"), ["iptables -A INPUT -s 10.0.10.0/24 -p tcp --dport 22 -m conntrack --ctstate NEW -j ACCEPT"]);
eq(cmds(def, "nftables"), [
  "nft add table inet filter",
  "nft 'add chain inet filter input { type filter hook input priority 0; }'",
  "nft 'add rule inet filter input ip saddr 10.0.10.0/24 tcp dport 22 ct state new counter accept'",
]);
eq(cmds(def, "ufw"), ["ufw allow in proto tcp from 10.0.10.0/24 to any port 22"]);
eq(cmds(def, "firewalld"), [
  `firewall-cmd --permanent --zone=public --add-rich-rule='rule family="ipv4" source address="10.0.10.0/24" port port="22" protocol="tcp" accept'`,
]);
eq(buildRule(def).family, "ipv4");

// sudo prefix and comments
const withComment = rule({ sudo: true, comment: "SSH from management" });
eq(cmds(withComment, "iptables"), [
  'sudo iptables -A INPUT -s 10.0.10.0/24 -p tcp --dport 22 -m conntrack --ctstate NEW -m comment --comment "SSH from management" -j ACCEPT',
]);
ok(cmds(withComment, "nftables")[2].endsWith(`accept comment "SSH from management"'`));
ok(cmds(withComment, "ufw")[0].endsWith("comment 'SSH from management'"));
ok(out(withComment, "firewalld").commands.includes("# SSH from management"));

/* --------------------------------------------- family both, no address */

const web = rule({ source: "", destPorts: "80,443", state: "any" });
eq(buildRule(web).family, "both");
eq(cmds(web, "iptables"), [
  "iptables -A INPUT -p tcp -m multiport --dports 80,443 -j ACCEPT",
  "ip6tables -A INPUT -p tcp -m multiport --dports 80,443 -j ACCEPT",
]);
eq(cmds(web, "nftables")[2], "nft 'add rule inet filter input tcp dport { 80, 443 } counter accept'");
eq(cmds(web, "ufw"), ["ufw allow in proto tcp from any to any port 80,443"]);
eq(cmds(web, "firewalld"), [
  `firewall-cmd --permanent --zone=public --add-rich-rule='rule port port="80" protocol="tcp" accept'`,
  `firewall-cmd --permanent --zone=public --add-rich-rule='rule port port="443" protocol="tcp" accept'`,
]);

/* ---------------------------------------------- tcp and udp, DNS style */

const dns = rule({ source: "192.0.2.0/24", protocol: "tcpudp", destPorts: "53", state: "any" });
eq(cmds(dns, "iptables"), [
  "iptables -A INPUT -s 192.0.2.0/24 -p tcp --dport 53 -j ACCEPT",
  "iptables -A INPUT -s 192.0.2.0/24 -p udp --dport 53 -j ACCEPT",
]);
eq(cmds(dns, "nftables")[2], "nft 'add rule inet filter input ip saddr 192.0.2.0/24 meta l4proto { tcp, udp } th dport 53 counter accept'");
eq(cmds(dns, "ufw"), ["ufw allow in from 192.0.2.0/24 to any port 53"]);
eq(cmds(dns, "firewalld").length, 2);
ok(cmds(dns, "firewalld")[1].includes('port port="53" protocol="udp"'));

const dnsRange = rule({ source: "", protocol: "tcpudp", destPorts: "6000-6010", state: "any" });
eq(cmds(dnsRange, "ufw"), [
  "ufw allow in proto tcp from any to any port 6000:6010",
  "ufw allow in proto udp from any to any port 6000:6010",
]);
eq(cmds(dnsRange, "iptables").slice(0, 2), [
  "iptables -A INPUT -p tcp --dport 6000:6010 -j ACCEPT",
  "iptables -A INPUT -p udp --dport 6000:6010 -j ACCEPT",
]);
eq(cmds(dnsRange, "nftables")[2], "nft 'add rule inet filter input meta l4proto { tcp, udp } th dport 6000-6010 counter accept'");
ok(cmds(dnsRange, "firewalld")[0].includes('port port="6000-6010" protocol="tcp"'));

/* --------------------------------------------------- IPv6 and ICMPv6 */

const v6 = rule({ source: "2001:db8:10::/48", destPorts: "22" });
eq(cmds(v6, "iptables"), ["ip6tables -A INPUT -s 2001:db8:10::/48 -p tcp --dport 22 -m conntrack --ctstate NEW -j ACCEPT"]);
ok(cmds(v6, "nftables")[2].includes("ip6 saddr 2001:db8:10::/48 tcp dport 22"));
ok(cmds(v6, "firewalld")[0].includes('family="ipv6" source address="2001:db8:10::/48"'));

const icmp6 = rule({ source: "", protocol: "icmpv6", destPorts: "", state: "any" });
eq(buildRule(icmp6).family, "ipv6");
eq(cmds(icmp6, "iptables"), ["ip6tables -A INPUT -p ipv6-icmp -j ACCEPT"]);
eq(cmds(icmp6, "nftables")[2], "nft 'add rule inet filter input meta l4proto ipv6-icmp counter accept'");
eq(out(icmp6, "ufw").supported, false);
ok(out(icmp6, "ufw").notes[0].includes("before6.rules"));
eq(cmds(icmp6, "firewalld"), [
  `firewall-cmd --permanent --zone=public --add-rich-rule='rule family="ipv6" protocol value="ipv6-icmp" accept'`,
]);

const icmp4 = rule({ source: "10.0.0.0/8", protocol: "icmp", destPorts: "", state: "any" });
eq(cmds(icmp4, "iptables"), ["iptables -A INPUT -s 10.0.0.0/8 -p icmp -j ACCEPT"]);

/* ------------------------------------------------------ error paths */

const bad = (patch: Partial<RuleSpec>) => {
  const r = buildRule(rule(patch));
  assert.ok(!r.ok, JSON.stringify(patch));
  assert.equal(r.outputs.length, 0);
  return r.errors;
};
eq(bad({ protocol: "any", destPorts: "22" })[0].field, "destPorts");
eq(bad({ protocol: "icmp", destPorts: "22" })[0].field, "destPorts");
eq(bad({ source: "10.0.0.0/8", destination: "2001:db8::1" })[0].field, "destination");
eq(bad({ source: "2001:db8::/32", protocol: "icmp", destPorts: "" })[0].field, "protocol");
eq(bad({ source: "10.0.0.0/8", protocol: "icmpv6", destPorts: "" })[0].field, "protocol");
eq(bad({ inIface: "eth0; reboot" })[0].field, "inIface");
eq(bad({ comment: "a'b" })[0].field, "comment");
eq(bad({ log: true, logPrefix: 'x"y' })[0].field, "logPrefix");
eq(bad({ source: "nope", destPorts: "0" }).length, 2);
// fields that do not apply to the direction are ignored rather than validated
ok(buildRule(rule({ direction: "input", outIface: "bad name!" })).ok);

/* --------------------------------------- direction, interfaces, state */

const out1 = rule({
  direction: "output",
  action: "reject",
  source: "",
  destination: "203.0.113.0/24",
  destPorts: "25",
  outIface: "eth0",
  state: "any",
});
eq(cmds(out1, "iptables"), ["iptables -A OUTPUT -o eth0 -d 203.0.113.0/24 -p tcp --dport 25 -j REJECT"]);
eq(cmds(out1, "nftables")[1], "nft 'add chain inet filter output { type filter hook output priority 0; }'");
eq(cmds(out1, "nftables")[2], `nft 'add rule inet filter output oifname "eth0" ip daddr 203.0.113.0/24 tcp dport 25 counter reject'`);
eq(cmds(out1, "ufw"), ["ufw reject out on eth0 proto tcp from any to 203.0.113.0/24 port 25"]);
eq(cmds(out1, "firewalld"), [
  "firewall-cmd --permanent --new-policy=host-egress",
  "firewall-cmd --permanent --policy=host-egress --add-ingress-zone=HOST",
  "firewall-cmd --permanent --policy=host-egress --add-egress-zone=ANY",
  `firewall-cmd --permanent --policy=host-egress --add-rich-rule='rule family="ipv4" destination address="203.0.113.0/24" port port="25" protocol="tcp" reject'`,
]);

const fwd = rule({
  direction: "forward",
  action: "accept",
  source: "10.1.0.0/16",
  destPorts: "443",
  inIface: "eth1",
  outIface: "eth0",
  state: "new",
});
eq(cmds(fwd, "iptables"), ["iptables -A FORWARD -i eth1 -o eth0 -s 10.1.0.0/16 -p tcp --dport 443 -m conntrack --ctstate NEW -j ACCEPT"]);
eq(cmds(fwd, "nftables")[2], `nft 'add rule inet filter forward iifname "eth1" oifname "eth0" ip saddr 10.1.0.0/16 tcp dport 443 ct state new counter accept'`);
eq(cmds(fwd, "ufw"), ["ufw route allow in on eth1 out on eth0 proto tcp from 10.1.0.0/16 to any port 443"]);
ok(cmds(fwd, "firewalld")[1].includes("--add-ingress-zone=ANY"));
ok(buildRule(fwd).warnings.some((w) => w.text.includes("ip_forward")));

const est = rule({ source: "", destPorts: "", protocol: "any", state: "established" });
eq(cmds(est, "iptables"), [
  "iptables -A INPUT -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT",
  "ip6tables -A INPUT -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT",
]);
eq(cmds(est, "nftables")[2], "nft 'add rule inet filter input ct state established,related counter accept'");
eq(out(est, "ufw").supported, false);
eq(out(est, "firewalld").supported, false);
ok(buildRule(est).warnings.some((w) => w.text.includes("top of INPUT")));

const inv = rule({ source: "", destPorts: "", protocol: "any", state: "invalid", action: "drop" });
eq(cmds(inv, "nftables")[2], "nft 'add rule inet filter input ct state invalid counter drop'");
eq(out(inv, "ufw").supported, false);

/* -------------------------------------------- logging and placement */

const logged = rule({ action: "drop", source: "", destPorts: "23", state: "any", log: true, logPrefix: "telnet-drop:", logLimit: true });
eq(cmds(logged, "iptables"), [
  'iptables -A INPUT -p tcp --dport 23 -m limit --limit 5/min -j LOG --log-prefix "telnet-drop: "',
  "iptables -A INPUT -p tcp --dport 23 -j DROP",
  'ip6tables -A INPUT -p tcp --dport 23 -m limit --limit 5/min -j LOG --log-prefix "telnet-drop: "',
  "ip6tables -A INPUT -p tcp --dport 23 -j DROP",
]);
eq(cmds(logged, "nftables").slice(2), [
  `nft 'add rule inet filter input tcp dport 23 limit rate 5/minute log prefix "telnet-drop: "'`,
  "nft 'add rule inet filter input tcp dport 23 counter drop'",
]);
eq(cmds(logged, "ufw"), ["ufw deny in log proto tcp from any to any port 23"]);
eq(cmds(logged, "firewalld"), [
  `firewall-cmd --permanent --zone=public --add-rich-rule='rule port port="23" protocol="tcp" log prefix="telnet-drop: " level="info" limit value="5/m" drop'`,
]);

const loggedNoLimit = { ...logged, logLimit: false, logPrefix: "" };
eq(cmds(loggedNoLimit, "nftables")[2], `nft 'add rule inet filter input tcp dport 23 counter log prefix "INPUT DROP: " drop'`);
ok(cmds(loggedNoLimit, "iptables")[0].endsWith('-j LOG --log-prefix "INPUT DROP: "'));
ok(buildRule(loggedNoLimit).warnings.some((w) => w.text.includes("rate limit")));

const top = { ...logged, placement: "top" as const, protocol: "tcpudp" as const };
eq(cmds(top, "iptables").slice(0, 4), [
  'iptables -I INPUT 1 -p tcp --dport 23 -m limit --limit 5/min -j LOG --log-prefix "telnet-drop: "',
  "iptables -I INPUT 2 -p tcp --dport 23 -j DROP",
  'iptables -I INPUT 3 -p udp --dport 23 -m limit --limit 5/min -j LOG --log-prefix "telnet-drop: "',
  "iptables -I INPUT 4 -p udp --dport 23 -j DROP",
]);
eq(cmds(top, "iptables")[4], 'ip6tables -I INPUT 1 -p tcp --dport 23 -m limit --limit 5/min -j LOG --log-prefix "telnet-drop: "');
// inserted in reverse so the log rule ends up above the verdict
eq(cmds(top, "nftables").slice(2), [
  "nft 'insert rule inet filter input meta l4proto { tcp, udp } th dport 23 counter drop'",
  `nft 'insert rule inet filter input meta l4proto { tcp, udp } th dport 23 limit rate 5/minute log prefix "telnet-drop: "'`,
]);
eq(cmds(top, "ufw"), ["ufw prepend deny in log from any to any port 23"]);
ok(cmds(top, "firewalld")[0].startsWith(`firewall-cmd --permanent --zone=public --add-rich-rule='rule priority="-1" port port="23"`));

const routeTop = { ...fwd, placement: "top" as const };
eq(cmds(routeTop, "ufw"), ["ufw route insert 1 allow in on eth1 out on eth0 proto tcp from 10.1.0.0/16 to any port 443"]);

/* ---------------------------------------- source ports and firewalld */

const sp = rule({ source: "", protocol: "udp", sourcePorts: "123", destPorts: "123", state: "any" });
eq(cmds(sp, "iptables"), [
  "iptables -A INPUT -p udp --sport 123 --dport 123 -j ACCEPT",
  "ip6tables -A INPUT -p udp --sport 123 --dport 123 -j ACCEPT",
]);
eq(cmds(sp, "ufw"), ["ufw allow in proto udp from any port 123 to any port 123"]);
eq(out(sp, "firewalld").supported, false);
const sponly = rule({ source: "", protocol: "udp", sourcePorts: "53", destPorts: "", state: "any" });
ok(cmds(sponly, "firewalld")[0].includes('source-port port="53" protocol="udp"'));
const multiBoth = rule({ source: "", protocol: "tcp", sourcePorts: "1024-2048,3000", destPorts: "80,443", state: "any" });
eq(cmds(multiBoth, "iptables")[0], "iptables -A INPUT -p tcp -m multiport --sports 1024:2048,3000 -m multiport --dports 80,443 -j ACCEPT");

/* ------------------------------------------------------------ warnings */

const catchAll = rule({ action: "drop", source: "", destPorts: "", protocol: "any", state: "any" });
const ca = buildRule(catchAll);
ok(ca.ok);
ok(ca.warnings.some((w) => w.tone === "danger" && w.text.includes("SSH session")));
eq(out(catchAll, "firewalld").supported, false);
ok(out(catchAll, "firewalld").notes[0].includes("--set-target=DROP"));
ok(out(rule({ action: "reject", source: "", destPorts: "", protocol: "any", state: "any" }), "firewalld").notes[0].includes("%%REJECT%%"));
// Output and forward catch-alls are policy targets, which spell reject as REJECT (firewalld.policy(5)).
const outAll = out(rule({ direction: "output", action: "reject", source: "", destPorts: "", protocol: "any", state: "any" }), "firewalld");
eq(outAll.supported, false);
ok(outAll.notes[0].includes("--policy=host-egress --set-target=REJECT") && !outAll.notes[0].includes("%%"), outAll.notes[0]);
ok(!outAll.notes[0].includes("--zone="));
const fwdAll = out(rule({ direction: "forward", action: "drop", source: "", destPorts: "", protocol: "any", state: "any", inIface: "eth1", outIface: "eth0" }), "firewalld");
ok(fwdAll.notes[0].includes("--policy=forward-any --set-target=DROP") && fwdAll.notes[0].includes("eth1 and eth0"), fwdAll.notes[0]);
const ifaceAll = out(rule({ action: "accept", source: "", destPorts: "", protocol: "any", state: "any", inIface: "wg0", zone: "trusted" }), "firewalld");
ok(ifaceAll.notes[0].includes("--zone=trusted --change-interface=wg0") && ifaceAll.notes[0].includes("--set-target=ACCEPT"), ifaceAll.notes[0]);

const openSsh = buildRule(rule({ source: "", destPorts: "20-25,3306" }));
const exposed = openSsh.warnings.find((w) => w.tone === "warn");
ok(exposed && exposed.text.includes("SSH (22)") && exposed.text.includes("Telnet (23)") && exposed.text.includes("MySQL (3306)"));
ok(!buildRule(rule({})).warnings.some((w) => w.tone === "warn"));
ok(buildRule(rule({ source: "10.0.10.9/24" })).warnings.some((w) => w.text.includes("10.0.10.0/24")));
ok(buildRule(rule({ source: "::ffff:10.0.0.1", destPorts: "22" })).warnings.some((w) => w.text.includes("IPv4-mapped")));
ok(buildRule(rule({ state: "invalid", action: "accept" })).warnings.some((w) => w.text.includes("INVALID")));

/* ------------------------------------------------------------ baseline */

const base = buildBaseline({ ...DEFAULT_BASELINE, sudo: false });
ok(base.ok);
const v4file = base.outputs[0].files[0].content;
eq(
  v4file,
  [
    "# /etc/iptables/rules.v4: deny inbound, allow SSH from 10.0.10.0/24",
    "*filter",
    ":INPUT DROP [0:0]",
    ":FORWARD DROP [0:0]",
    ":OUTPUT ACCEPT [0:0]",
    "-A INPUT -i lo -j ACCEPT",
    "-A INPUT -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT",
    "-A INPUT -m conntrack --ctstate INVALID -j DROP",
    "-A INPUT -p icmp --icmp-type echo-request -j ACCEPT",
    "-A INPUT -s 10.0.10.0/24 -p tcp --dport 22 -m conntrack --ctstate NEW -j ACCEPT",
    "COMMIT",
    "",
  ].join("\n"),
);
const v6file = base.outputs[0].files[1].content;
ok(v6file.startsWith("# /etc/iptables/rules.v6: deny inbound, no SSH over IPv6"));
for (const t of [1, 2, 3, 4, 128, 130, 134, 135, 136]) ok(v6file.includes(`--icmpv6-type ${t} -j ACCEPT`), `type ${t}`);
ok(!v6file.includes("--dport 22"));
const nftConf = base.outputs[1].files[0].content;
ok(nftConf.includes("type filter hook input priority 0; policy drop;"));
ok(nftConf.includes("icmpv6 type { destination-unreachable, packet-too-big, time-exceeded, parameter-problem, mld-listener-query, nd-router-advert, nd-neighbor-solicit, nd-neighbor-advert, echo-request } accept"));
ok(nftConf.includes('ip saddr 10.0.10.0/24 tcp dport 22 ct state new counter accept comment "SSH from management"'));
// the order is the point: established before the allow rules, policy at the end
ok(nftConf.indexOf("established,related") < nftConf.indexOf("tcp dport 22"));
ok(nftConf.indexOf("ct state invalid drop") < nftConf.indexOf("tcp dport 22"));
eq(base.steps[1].rule, "ct state established,related accept");
eq(base.steps[base.steps.length - 1].rule, "policy drop");
const ufwB = base.outputs[2].commands;
ok(ufwB.indexOf("ufw allow proto tcp from 10.0.10.0/24 to any port 22 comment 'SSH from management'") < ufwB.indexOf("ufw enable"));
ok(base.outputs[3].commands[0].includes(`rule family="ipv4" source address="10.0.10.0/24" port port="22" protocol="tcp" accept`));
ok(!base.outputs[3].notes.some((n) => n.includes("semanage")));

const base6 = buildBaseline({ mgmt: "2001:db8:aa::/64", sshPort: "2222", allowPing: false, sudo: true });
ok(base6.ok);
ok(base6.outputs[0].files[1].content.includes("-A INPUT -s 2001:db8:aa::/64 -p tcp --dport 2222 -m conntrack --ctstate NEW -j ACCEPT"));
ok(!base6.outputs[0].files[0].content.includes("--dport"));
ok(!base6.outputs[0].files[0].content.includes("echo-request"));
ok(!base6.outputs[0].files[1].content.includes("--icmpv6-type 128"));
ok(base6.outputs[1].files[0].content.includes("ip6 saddr 2001:db8:aa::/64 tcp dport 2222"));
ok(!base6.outputs[1].files[0].content.includes("icmp type echo-request"));
ok(base6.outputs[3].commands.some((c) => c.includes("--add-icmp-block=echo-request")));
ok(base6.outputs[3].notes.some((n) => n.includes("semanage port -a -t ssh_port_t -p tcp 2222")));
ok(base6.outputs[0].commands.every((c) => c.startsWith("#") || c.startsWith("sudo ")));

eq(buildBaseline({ ...DEFAULT_BASELINE, mgmt: "" }).errors[0].field, "mgmt");
eq(buildBaseline({ ...DEFAULT_BASELINE, mgmt: "0.0.0.0/0" }).errors[0].field, "mgmt");
eq(buildBaseline({ ...DEFAULT_BASELINE, sshPort: "70000" }).errors[0].field, "sshPort");
eq(buildBaseline({ ...DEFAULT_BASELINE, sshPort: "22a" }).errors[0].field, "sshPort");
eq(buildBaseline({ ...DEFAULT_BASELINE, mgmt: "10.0.10.77/24" }).mgmt?.text, "10.0.10.0/24");

/* --------------------------------------------- adversarial and fuzz */

const junk = ["", " ", "\u0000", "'\"`$(){};|&<>", "%".repeat(300), "::::", "1.2.3.4/abc", "-1", "9".repeat(400), "\n\n"];
for (const s of junk) {
  for (const field of ["source", "destination", "sourcePorts", "destPorts", "inIface", "outIface", "comment", "logPrefix", "zone"] as const) {
    const r = buildRule(rule({ [field]: s, log: true, direction: "forward" }));
    // must never throw; any output must not contain the raw junk
    if (r.ok) {
      for (const o of r.outputs) for (const c of o.commands) ok(!c.includes("`") && !c.includes("$("), c);
    }
  }
}
// every combination of the enums builds without throwing
for (const direction of ["input", "output", "forward"] as const)
  for (const action of ["accept", "drop", "reject"] as const)
    for (const protocol of ["any", "tcp", "udp", "tcpudp", "icmp", "icmpv6"] as const)
      for (const state of ["any", "new", "established", "invalid"] as const)
        for (const placement of ["append", "top"] as const) {
          const ports = protocol === "tcp" || protocol === "udp" || protocol === "tcpudp" ? "22,80" : "";
          const r = buildRule(rule({ direction, action, protocol, state, placement, destPorts: ports, source: "", log: true }));
          ok(r.ok, JSON.stringify(r.errors));
          eq(r.outputs.length, 4);
          for (const o of r.outputs) if (o.supported) ok(o.commands.length > 0);
        }

// no em dashes anywhere in generated text
const all = JSON.stringify([buildRule(def), base, base6, buildRule(top), buildRule(fwd), buildRule(catchAll)]);
ok(!all.includes("—"));


/* ===================================================================
 * Independent verifier cases (second pass). Reference values come from
 * RFC 4291 section 2.2, RFC 5952 section 4, iptables-extensions(8),
 * nft(8), ufw(8) and firewalld.richlanguage(5).
 * ================================================================= */
{
  const t = (s: string) => {
    const r = parseAddress(s);
    assert.ok(r.ok, `${s}: ${r.ok ? "" : r.error}`);
    return r.value?.text;
  };
  // RFC 5952 4.2.3: the longest run of zero groups is the one compressed.
  eq(t("2001:0:0:1:0:0:0:1"), "2001:0:0:1::1");
  // RFC 5952 4.2.3: on a tie, the first run is compressed.
  eq(t("2001:db8:0:0:1:0:0:1"), "2001:db8::1:0:0:1");
  // RFC 5952 4.2.2: a single zero group is never written as ::.
  eq(t("2001:db8:0:1:1:1:1:1"), "2001:db8:0:1:1:1:1:1");
  eq(t("1:2:3:4:5:6:7::"), "1:2:3:4:5:6:7:0");
  // RFC 5952 4.3: lowercase.
  eq(t("2001:DB8::ABCD"), "2001:db8::abcd");
  // RFC 4291 2.2 examples.
  eq(t("2001:DB8:0:0:8:800:200C:417A"), "2001:db8::8:800:200c:417a");
  eq(t("FF01:0:0:0:0:0:0:101"), "ff01::101");
  eq(t("0:0:0:0:0:0:0:1"), "::1");
  eq(t("0:0:0:0:0:0:0:0"), "::");
  eq(t("::FFFF:129.144.52.38"), "::ffff:129.144.52.38");
  ok(parseAddress("::ffff:129.144.52.38").ok && (parseAddress("::ffff:129.144.52.38") as { ok: true; value: { mapped: boolean } }).value.mapped);
  // Host bits cleared.
  eq(t("2001:db8:abcd:12::1/48"), "2001:db8:abcd::/48");
  eq(t("192.0.2.77/26"), "192.0.2.64/26");
  eq(t("255.255.255.255/31"), "255.255.255.254/31");
  eq(t("0.0.0.0/0"), "0.0.0.0/0");
  eq(t("::/0"), "::/0");
  eq(t(" 10.1.2.3 "), "10.1.2.3");
  // Malformed input is rejected with a message, never thrown.
  for (const bad of [
    "1.2.3.4/33", "::/129", "fe80::1%eth0", "1::2::3", "12345::", "1.2.3.04", "1.2.3", "01.2.3.4", "1.2.3.4/024",
    "1.2.3.4/", "/24", "1.2.3.4/-1", "10.0.0.0/8,10.1.0.0/16", "a".repeat(100000), "１.2.3.4", "1.2.3.4.5", "::1::",
    ":::", "1:2:3:4:5:6:7:8:9", "1.2.3.4::", "g::1", "1.2.3.256", "host.example", "10.0.0.1 10.0.0.2", "\u0000",
  ]) {
    const r = parseAddress(bad);
    ok(!r.ok && typeof r.error === "string" && r.error.length > 0 && r.error.length < 400, `should reject ${bad.slice(0, 30)}`);
  }

  // Ports: 1 to 65535, multiport slots per iptables-extensions(8).
  const pp = (s: string) => parsePorts(s);
  ok(pp("1").ok && pp("65535").ok);
  for (const bad of ["0", "65536", "99999", "443-80", "-1", "80-", "22,,23", ",", "http", "1e3", "22 23", "２２"]) ok(!pp(bad).ok, `port ${bad}`);
  const fifteen = Array.from({ length: 15 }, (_, i) => String(1000 + i)).join(",");
  ok(pp(fifteen).ok);
  ok(!pp(`${fifteen},2000`).ok);
  const sevenRanges = Array.from({ length: 7 }, (_, i) => `${3000 + i * 10}-${3005 + i * 10}`).join(",");
  ok(pp(`${sevenRanges},22`).ok);
  ok(!pp(`${sevenRanges},4000-4001`).ok);
  const dup = pp("22,22,22");
  ok(dup.ok && dup.value?.items.length === 1);
  const range = pp("1-65535");
  ok(range.ok && range.value?.slots === 2);

  // The four renderings of the default rule, token for token.
  const base1 = rule({ comment: "SSH from management" });
  eq(cmds(base1, "iptables"), [
    'iptables -A INPUT -s 10.0.10.0/24 -p tcp --dport 22 -m conntrack --ctstate NEW -m comment --comment "SSH from management" -j ACCEPT',
  ]);
  eq(cmds(base1, "nftables").at(-1), `nft 'add rule inet filter input ip saddr 10.0.10.0/24 tcp dport 22 ct state new counter accept comment "SSH from management"'`);
  eq(cmds(base1, "ufw"), ["ufw allow in proto tcp from 10.0.10.0/24 to any port 22 comment 'SSH from management'"]);
  eq(cmds(base1, "firewalld"), [
    `firewall-cmd --permanent --zone=public --add-rich-rule='rule family="ipv4" source address="10.0.10.0/24" port port="22" protocol="tcp" accept'`,
  ]);
  // Multiport with a range, written with a colon for iptables and ufw, a hyphen for nft and firewalld.
  const web = rule({ source: "", destPorts: "80,443,8000-8010" });
  ok(cmds(web, "iptables")[0].includes("-p tcp -m multiport --dports 80,443,8000:8010"));
  ok(cmds(web, "nftables").at(-1)!.includes("tcp dport { 80, 443, 8000-8010 }"));
  ok(cmds(web, "ufw")[0].includes("proto tcp from any to any port 80,443,8000:8010"));
  eq(cmds(web, "firewalld").length, 3);
  ok(cmds(web, "firewalld")[2].includes('port port="8000-8010" protocol="tcp"'));
  // TCP and UDP together: th in nft, one rule per protocol in iptables.
  const dns = rule({ protocol: "tcpudp", destPorts: "53", source: "192.168.1.0/24" });
  ok(cmds(dns, "nftables").at(-1)!.includes("meta l4proto { tcp, udp } th dport 53"));
  eq(cmds(dns, "iptables").length, 2);
  ok(!cmds(dns, "ufw")[0].includes("proto"));
  // firewalld: family comes first among the rule attributes, then priority.
  const topFw = cmds(rule({ placement: "top" }), "firewalld")[0];
  ok(topFw.includes(`rule family="ipv4" priority="-1" source address=`), topFw);
  const topNote = out(rule({ placement: "top" }), "firewalld").notes.join(" ");
  ok(topNote.includes("default priority of 0"));
  // A zone value is only checked for input rules, where the field is shown.
  ok(buildRule(rule({ direction: "output", zone: "bad zone!" })).ok);
  ok(buildRule(rule({ direction: "forward", zone: "x".repeat(40) })).ok);
  ok(!buildRule(rule({ direction: "input", zone: "bad zone!" })).ok);
  // Interfaces: IFNAMSIZ 16 including NUL.
  ok(checkIface("abcdefghijklmno").ok);
  ok(!checkIface("abcdefghijklmnop").ok);
  for (const bad of ["eth0:1", "eth+", "eth*", ".", "..", "eth 0", "eth/0", "é0"]) ok(!checkIface(bad).ok, `iface ${bad}`);
  const plus = checkIface("eth+");
  ok(!plus.ok && !plus.error.includes("ufw"));
  // Log prefix: 29 bytes in the kernel, one used by the trailing space.
  ok(checkLogPrefix("x".repeat(28)).ok);
  ok(!checkLogPrefix("x".repeat(29)).ok);
  ok(!checkLogPrefix('a"b').ok);
  // Comments: nft keeps 128; quotes, $ and non-ASCII refused.
  ok(checkComment("c".repeat(128)).ok);
  ok(!checkComment("c".repeat(129)).ok);
  for (const bad of ['say "hi"', "it's", "a`b`", "$HOME", "a\\b", "café", "wow!"]) ok(!checkComment(bad).ok, `comment ${bad}`);
  // Families must agree.
  ok(!buildRule(rule({ source: "10.0.0.0/8", destination: "2001:db8::1" })).ok);
  ok(!buildRule(rule({ protocol: "icmp", destPorts: "", source: "2001:db8::/32" })).ok);
  ok(!buildRule(rule({ protocol: "icmpv6", destPorts: "", source: "10.0.0.0/8" })).ok);
  ok(!buildRule(rule({ protocol: "icmp", destPorts: "22" })).ok);
  eq(buildRule(rule({ protocol: "icmpv6", destPorts: "", source: "" })).family, "ipv6");

  // Baseline.
  const b1 = buildBaseline({ ...DEFAULT_BASELINE, mgmt: "10.0.10.5/24" });
  ok(b1.ok);
  eq(b1.mgmt?.text, "10.0.10.0/24");
  const nftFile = b1.outputs.find((o) => o.tool === "nftables")!.files[0].content;
  ok(nftFile.includes("ip saddr 10.0.10.0/24 tcp dport 22 ct state new counter accept"));
  ok(nftFile.indexOf("ct state established,related accept") < nftFile.indexOf("tcp dport 22"));
  ok(nftFile.includes("policy drop;"));
  for (const bad of ["0", "65536", "", "22a", "２２", "-22", "1e2"]) ok(!buildBaseline({ ...DEFAULT_BASELINE, sshPort: bad }).ok, `ssh port ${bad}`);
  ok(buildBaseline({ ...DEFAULT_BASELINE, sshPort: " 2222 " }).ok);
  for (const bad of ["", "any", "0.0.0.0/0", "::/0", "nope"]) ok(!buildBaseline({ ...DEFAULT_BASELINE, mgmt: bad }).ok, `mgmt ${bad}`);
  const b6 = buildBaseline({ ...DEFAULT_BASELINE, mgmt: "2001:db8:1::/48" });
  ok(b6.ok);
  const v4 = b6.outputs.find((o) => o.tool === "iptables")!.files[0].content;
  const v6 = b6.outputs.find((o) => o.tool === "iptables")!.files[1].content;
  ok(!v4.includes("--dport") && v6.includes("-s 2001:db8:1::/48 -p tcp --dport 22"));
  ok(b6.outputs.find((o) => o.tool === "nftables")!.files[0].content.includes("ip6 saddr 2001:db8:1::/48"));
  ok(b6.outputs.find((o) => o.tool === "firewalld")!.commands[0].includes('family="ipv6"'));
  const ufwBase = b1.outputs.find((o) => o.tool === "ufw")!.commands;
  ok(ufwBase.findIndex((c) => c.includes("allow proto tcp")) < ufwBase.findIndex((c) => c.endsWith("ufw enable")));

  // Hostile values in every free text field never throw.
  let seed = 7;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  const alphabet = ["a", "1", ".", ":", "/", "-", ",", " ", "\"", "'", "$", "\\", "é", "😀", "\u0000", "%", "*", "+", "\n", "="];
  const junk = () => Array.from({ length: Math.floor(rnd() * 24) }, () => alphabet[Math.floor(rnd() * alphabet.length)]).join("");
  for (let i = 0; i < 3000; i += 1) {
    const spec = rule({
      source: junk(), destination: junk(), sourcePorts: junk(), destPorts: junk(), inIface: junk(), outIface: junk(),
      comment: junk(), logPrefix: junk(), zone: junk(), log: rnd() > 0.5,
    });
    const r = buildRule(spec);
    ok(r.ok || r.errors.length > 0);
    const b = buildBaseline({ mgmt: junk(), sshPort: junk(), allowPing: rnd() > 0.5, sudo: true });
    ok(b.ok || b.errors.length > 0);
  }
}

console.log(`firewall-rule-builder: ${count} assertions passed`);
