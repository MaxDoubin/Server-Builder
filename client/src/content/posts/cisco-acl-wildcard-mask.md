
## The short answer

A wildcard mask is a subnet mask turned inside out: in Cisco's words, [each 0 bit means "this bit must match exactly" and each 1 means "this bit can be ignored (do not care)"](https://www.cisco.com/c/en/us/support/docs/security/ios-firewall/23602-confaccesslists.html). To calculate one, subtract the subnet mask from 255.255.255.255 one octet at a time, so a /24 (255.255.255.0) becomes 0.0.0.255, a /30 becomes 0.0.0.3, and the private block [172.16.0.0/12](https://www.rfc-editor.org/rfc/rfc1918) becomes 0.15.255.255. In an access list, `host 10.1.1.2` means 10.1.1.2 0.0.0.0, `any` means 0.0.0.0 255.255.255.255, and [an omitted wildcard is read as 0.0.0.0](https://www.cisco.com/c/en/us/td/docs/ios-xml/ios/sec_data_acl/configuration/xe-17/sec-data-acl-xe-17-book/sec-create-ip-apply.html). Wildcard bits do not have to be contiguous, so nothing in the syntax marks a subnet mask typed in the wildcard position as wrong: `permit 10.1.1.0 255.255.255.0` ignores the first three octets and matches 16,777,216 addresses, the size of a [/8](https://www.rfc-editor.org/rfc/rfc4632), where 0.0.0.255 would match 256. Verify an entry with `show access-lists`, and add an explicit `deny ip any any` if the implicit deny at the end needs its own counter.

## What is a wildcard mask, and how is it different from a subnet mask?

A subnet mask says how long the network prefix is. [RFC 4632](https://www.rfc-editor.org/rfc/rfc4632) writes the length as a slash followed by "a decimal value between 0 and 32 that describes the number of significant bits," and its section 5.1 says "the mask must be left contiguous," meaning all ones, then all zeros. An ACL asks a different question about each address bit: compare it, or skip it. Cisco's [IP access list guide](https://www.cisco.com/c/en/us/support/docs/security/ios-firewall/23602-confaccesslists.html) introduces the wildcard with "In contrast, ACLs use a wildcard mask (also called an inverse mask), which works in the opposite way."

| | Subnet mask | Wildcard mask |
|---|---|---|
| A 1 bit | Part of the network prefix | Ignore this bit |
| A 0 bit | Host bit | This bit must match |
| Shape | Contiguous, per RFC 4632 | Any 32-bit pattern; Cisco says [wildcard masks "allow noncontiguous bits"](https://www.cisco.com/c/en/us/td/docs/ios-xml/ios/sec_data_acl/configuration/xe-17/sec-data-acl-xe-17-book/sec-access-list-ov.html) |
| Example for a /24 | 255.255.255.0 | 0.0.0.255 |

A packet matches an entry when its address and the entry's address differ only in bit positions where the wildcard has a 1. The entry 10.1.2.0 0.0.0.255 works like this:

```text
ACL entry   10.1.2.0   00001010.00000001.00000010.00000000
Wildcard    0.0.0.255  00000000.00000000.00000000.11111111
Matches                00001010.00000001.00000010.xxxxxxxx
                       10.1.2.0 through 10.1.2.255
```

The first 24 bits must equal the entry's. The last eight can be anything. Cisco's own sample table in the [IP access list overview](https://www.cisco.com/c/en/us/td/docs/ios-xml/ios/sec_data_acl/configuration/xe-17/sec-data-acl-xe-17-book/sec-access-list-ov.html) shows the same idea at a smaller scale: 172.18.8.0 with 0.0.0.7 is described as "Only subnet 172.18.8.0/29 matches."

One consequence is easy to miss. Any bit under a 1 in the wildcard is ignored, including the corresponding bit in the address you typed. The same table lists 172.18.8.15 with 0.0.0.3 as "Only subnet 172.18.8.15/30 matches," but the block that entry covers is 172.18.8.12 through 172.18.8.15, because the two low bits of the .15 are skipped. Writing the real network address keeps the line readable. The [alignment article](/blog/alignment-is-what-runs-out) explains why a block has to start on a multiple of its own size.

## How do you calculate a wildcard mask from a prefix length or subnet mask?

Cisco's method is subtraction. The [guide](https://www.cisco.com/c/en/us/support/docs/security/ios-firewall/23602-confaccesslists.html) shows "255.255.255.255 - 255.255.255.0 (subnet mask) = 0.0.0.255 (inverse mask)." Do it octet by octet: 255 minus the mask octet. An octet that is 255 in the mask becomes 0, an octet that is 0 becomes 255, and only the one partial octet needs real arithmetic.

From a prefix length n, the wildcard has 32 minus n one bits on the right, and the entry matches 2 to the power of (32 minus n) addresses. The counts below are the "addrs/block" column of the table in [RFC 4632 section 3.1](https://www.rfc-editor.org/rfc/rfc4632).

| Prefix | Subnet mask | Wildcard mask | Addresses matched |
|---|---|---|---|
| /8 | 255.0.0.0 | 0.255.255.255 | 16,777,216 |
| /12 | 255.240.0.0 | 0.15.255.255 | 1,048,576 |
| /16 | 255.255.0.0 | 0.0.255.255 | 65,536 |
| /20 | 255.255.240.0 | 0.0.15.255 | 4,096 |
| /22 | 255.255.252.0 | 0.0.3.255 | 1,024 |
| /23 | 255.255.254.0 | 0.0.1.255 | 512 |
| /24 | 255.255.255.0 | 0.0.0.255 | 256 |
| /25 | 255.255.255.128 | 0.0.0.127 | 128 |
| /26 | 255.255.255.192 | 0.0.0.63 | 64 |
| /27 | 255.255.255.224 | 0.0.0.31 | 32 |
| /28 | 255.255.255.240 | 0.0.0.15 | 16 |
| /29 | 255.255.255.248 | 0.0.0.7 | 8 |
| /30 | 255.255.255.252 | 0.0.0.3 | 4 |
| /31 | 255.255.255.254 | 0.0.0.1 | 2 |
| /32 | 255.255.255.255 | 0.0.0.0 | 1 |

In the partial octet, the wildcard value is the block size minus one, and the block size is 256 minus the mask value. A mask octet of 192 gives blocks of 64 and a wildcard octet of 63.

### Worked examples

- **A /26 at 192.168.1.64.** 255.255.255.255 minus 255.255.255.192 is 0.0.0.63, so the entry is `192.168.1.64 0.0.0.63`, covering .64 through .127.
- **The private block 172.16.0.0/12.** The mask 255.240.0.0 gives 0.15.255.255, and `172.16.0.0 0.15.255.255` covers 172.16.0.0 through 172.31.255.255, the range [RFC 1918 section 3](https://www.rfc-editor.org/rfc/rfc1918) assigns to that block. The other two blocks in that section are 10.0.0.0/8 and 192.168.0.0/16.
- **Summarizing eight networks.** Cisco's guide covers 192.168.32.0/24 through 192.168.39.0/24 with `192.168.32.0 0.0.7.255`, because "If you subtract 255.255.248.0 (subnet mask) from 255.255.255.255, it yields 0.0.7.255."

```text
ip access-list extended BLOCK-PRIVATE-FROM-OUTSIDE
 deny ip 10.0.0.0 0.255.255.255 any
 deny ip 172.16.0.0 0.15.255.255 any
 deny ip 192.168.0.0 0.0.255.255 any
 permit ip any any
```

Applied inbound on an Internet-facing interface, a list like this drops packets that arrive from outside carrying a private source address.

### What if the range is not a power of two?

One entry cannot match exactly 10.1.1.10 through 10.1.1.20. An entry matches 2 to the power of (the number of 1 bits in its wildcard) addresses, so it always matches a power-of-two count, and the range holds 11. With contiguous wildcards each block also starts on a multiple of its own size. The range splits into four such blocks:

```text
permit ip 10.1.1.10 0.0.0.1 any
permit ip 10.1.1.12 0.0.0.3 any
permit ip 10.1.1.16 0.0.0.3 any
permit ip host 10.1.1.20 any
```

These cover .10 and .11, then .12 to .15, then .16 to .19, then .20 alone.

The [IP range to CIDR](/tools/ip-range-to-cidr) tool does that split automatically, the [wildcard mask calculator](/tools/wildcard-mask-calculator) checks any single pair, and the [subnetting guide](/blog/subnetting-practical-guide) covers the prefix side.

## What do host, any and 0.0.0.0 255.255.255.255 mean in an access list?

Cisco's guide defines both keywords in terms of the pair: "The source/wildcard of 0.0.0.0/255.255.255.255 means any," and "The source/wildcard of 10.1.1.2/0.0.0.0 is the same as host 10.1.1.2." Its [sample configurations page](https://www.cisco.com/c/en/us/support/docs/ip/access-lists/26448-ACLsamples.html) says the same for `access-list 1 permit 192.168.10.1 0.0.0.0`, which "is another way to configure the same rule" as `host 192.168.10.1`.

| You type | Equivalent pair | Matches |
|---|---|---|
| `host 10.1.1.2` | 10.1.1.2 0.0.0.0 | Exactly 10.1.1.2 |
| `10.1.1.2` (no wildcard) | 10.1.1.2 0.0.0.0 | Exactly 10.1.1.2 |
| `any` | 0.0.0.0 255.255.255.255 | Every address |
| `0.0.0.0` (no wildcard) | 0.0.0.0 0.0.0.0 | Only the address 0.0.0.0 |

The last row catches people who carry a habit over from routing. In a route, 0.0.0.0/0 means every destination. In an ACL, a bare 0.0.0.0 gets the default wildcard of 0.0.0.0, so every bit must match and only the all-zeros address does. Use `any`.

The same notation appears outside ACLs. In OSPF, the `network` command takes `network ip-address wildcard-mask area area-id`, and Cisco's [command reference](https://www.cisco.com/c/en/us/td/docs/ios-xml/ios/iproute_ospf/command/iro-cr-book/ospf-i1.html) describes the wildcard as an IP-address-type mask with "don't care" bits. Cisco's [IOS XE 17 routing guide](https://www.cisco.com/c/en/us/td/docs/routers/ios/config/17-x/ip-routing/b-ip-routing/m_iro-cfg-0.html) recommends enabling OSPF with the interface-level `ip ospf` command instead. The [OSPF article](/blog/ospf-routing-protocol) covers the protocol itself.

## How do standard and extended ACLs use wildcards, and where should each one be applied?

A standard ACL tests only the source address, so each entry has one address and wildcard. An extended ACL also tests the destination and other packet fields, so each entry can carry two pairs. Cisco's [overview](https://www.cisco.com/c/en/us/td/docs/ios-xml/ios/sec_data_acl/configuration/xe-17/sec-data-acl-xe-17-book/sec-access-list-ov.html) numbers standard lists 1 to 99 or 1300 to 1999 and extended lists 100 to 199 or 2000 to 2699, and the [IP access list guide](https://www.cisco.com/c/en/us/support/docs/security/ios-firewall/23602-confaccesslists.html) says named lists, created with `ip access-list standard` or `ip access-list extended`, arrived in Release 11.2.

| | Standard | Extended |
|---|---|---|
| Numbers | 1 to 99, 1300 to 1999 | 100 to 199, 2000 to 2699 |
| Tests | Source address | Source, destination, protocol, ports and more |
| Wildcard pairs per entry | One | Two |

Abbreviated from the syntax in Cisco's guide:

```text
access-list <1-99> {permit|deny} {host ADDR | ADDR WILDCARD | any}
access-list <100-199> {permit|deny} PROTOCOL SRC SRC-WILDCARD DST DST-WILDCARD [operator port]
```

### Where should each one go?

Cisco's overview is the type-specific source: "Because standard access lists test source addresses, they are very efficient at blocking traffic close to a destination," while extended lists "are good for blocking traffic anywhere." The IP access list guide gives general advice that does not distinguish the two types: "It is a good practice to apply the ACL on the interface closest to the source of the traffic." The two statements fit together once you consider what each type can see. A standard ACL placed near the source would block that source from everything beyond it, so it belongs near the one destination being protected. An extended ACL names the destination, so it can sit next to the source and stop unwanted traffic before it crosses the network.

Direction matters as much as the interface. The overview says "Inbound access lists process packets before the packets are routed to an outbound interface," that [only one access list per interface, per protocol and per direction is allowed](https://www.cisco.com/c/en/us/td/docs/ios-xml/ios/sec_data_acl/configuration/xe-17/sec-data-acl-xe-17-book/sec-access-list-ov.html), and that an outgoing list does not filter traffic generated by the device itself.

### A worked extended ACL

A user VLAN, 192.168.10.0/24, may reach one web server over HTTPS and nothing else in the server subnet 192.168.20.0/24, and may reach everything outside that subnet:

```text
ip access-list extended USERS-TO-SERVERS
 10 permit tcp 192.168.10.0 0.0.0.255 host 192.168.20.10 eq 443
 20 deny   ip  192.168.10.0 0.0.0.255 192.168.20.0 0.0.0.255
 30 permit ip  192.168.10.0 0.0.0.255 any
 40 deny   ip  any any
 exit
interface GigabitEthernet0/1
 description Gateway for VLAN 10
 ip access-group USERS-TO-SERVERS in
```

Each pair does a different job. `host 192.168.20.10` is the pair 192.168.20.10 0.0.0.0, the two /24 pairs use 0.0.0.255, and `any` is the pair of all ones. Line 10 has to come before line 20, because Cisco's samples page says "Because the Cisco IOS Software stops the test of conditions after the first match, the order of the conditions is critical." The [first-match article](/blog/first-match-wins) shows what a correct rule in the wrong position looks like, and the [firewall policy article](/blog/firewall-policy-design) covers the default-deny structure behind line 40. The [IOS fundamentals article](/blog/cisco-ios-fundamentals) covers the configuration modes used above.

This is also a CCNA topic. Cisco's [CCNA 200-301 v1.1 exam topics](https://learningcontent.cisco.com/documents/marketing/exam-topics/200-301-CCNA-v1.1.pdf) list objective 5.6, "Configure and verify access control lists," for a 120-minute exam.

## When do non-contiguous wildcard masks make sense, such as matching only odd addresses?

When the addresses you want share a bit pattern instead of a range. Cisco's overview says "wildcard masks allow noncontiguous bits in the mask," and Cisco's NX-OS guide states the contrast directly: a prefix [matches "only on the first contiguous bits," while a wildcard mask "matches on any bit in the address."](https://www.cisco.com/c/en/us/td/docs/switches/datacenter/nexus9000/sw/7-x/security/configuration/guide/b_Cisco_Nexus_9000_Series_NX-OS_Security_Configuration_Guide_7x/b_Cisco_Nexus_9000_Series_NX-OS_Security_Configuration_Guide_7x_chapter_01001.html) Put a 0 where the bit must be fixed and a 1 where it can vary.

| Entry | What it matches | Addresses |
|---|---|---|
| `192.168.1.1 0.0.0.254` | Odd last octets in 192.168.1.0/24 | 128 |
| `192.168.1.0 0.0.0.254` | Even last octets in 192.168.1.0/24 | 128 |
| `10.1.0.1 0.0.255.0` | The .1 address in every /24 under 10.1.0.0/16 | 256 |
| `10.1.0.0 0.0.254.255` | Every even-numbered /24 under 10.1.0.0/16 | 32,768 |

The third row is the practical one: if every VLAN gateway sits at .1 of its subnet, one entry covers all of them. It only stays correct while the addressing plan stays regular, and a colleague has to decode the mask to audit it.

### Cisco's own example needs a closer look

Cisco's overview lists `10.1.2.0` with `0.0.252.255` as "Matches any even-numbered network in the range of 10.1.2.0 to 10.1.254.0." Applying the bit rule from the same page, 252 is 11111100, so the top six bits of the third octet are ignored and the low two must equal those of 2, which is binary 10. That admits third octets 2, 6, 10 and so on up to 254, which is 64 networks, and skips 4, 8 and 12, which are even. For every even-numbered network, the mask is 0.0.254.255, where only the lowest bit is fixed at 0 (that mask also admits third octet 0, which is outside the range Cisco states). That reading comes from enumerating all 256 third-octet values against both masks, not from a Cisco statement, so confirm any unusual mask before it goes into production.

## Why does typing a subnet mask where a wildcard belongs match the wrong hosts without any error?

Because the syntax cannot tell the two apart. Cisco states that wildcard masks allow noncontiguous bits, so by that rule any 32-bit value is a legal wildcard, including 255.255.255.0, and there is nothing for the parser to reject. Apply the 1-means-ignore rule to `permit 10.1.1.0 255.255.255.0`: the three octets of 255 are ignored and the last octet must be 0. That matches 10.1.1.0, 203.0.113.0 and every other address ending in .0, and it does not match 10.1.1.77, which was the host the line was meant to cover.

| Intended | Correct entry | Typed by mistake | What the typo matches |
|---|---|---|---|
| 10.1.1.0/24 | `10.1.1.0 0.0.0.255` (256 addresses) | `10.1.1.0 255.255.255.0` | 16,777,216 addresses ending in .0 |
| 10.1.1.4/30 | `10.1.1.4 0.0.0.3` (4 addresses) | `10.1.1.4 255.255.255.252` | 1,073,741,824 addresses whose last octet is a multiple of 4 |
| 10.1.0.0/16 | `10.1.0.0 0.0.255.255` (65,536 addresses) | `10.1.0.0 255.255.0.0` | 65,536 addresses of the form a.b.0.0 |

The first typo matches as many addresses as a /8, which RFC 4632 lists at 16,777,216, and 65,536 times the 256 intended. The second matches a quarter of the 4,294,967,296 addresses in the IPv4 space, a figure that appears in the RFC 4632 table as the number of /32 blocks. The third matches the same number of addresses as the correct entry, but shares only the address 10.1.0.0 with it.

The damage depends on the action. A mistyped `permit` leaves the intended hosts to fall through to a later line or to the implicit deny, so the service they needed stops working. A mistyped `deny` leaves the intended hosts untouched and blocks unrelated addresses. Neither case produces an error. The visible symptom is a hit count that does not fit the traffic, which is what `show access-lists` is for, covered in the last section.

### Other platforms use other conventions

Moving a config between platforms is the most common way to meet this mistake:

- **ASA.** Cisco's [ASA 9.1 guide](https://www.cisco.com/c/en/us/td/docs/security/asa/asa91/configuration/general/asa_91_general_config/acl_extended.html) says "When you specify a network mask, the method is different from the Cisco IOS software access-list command," that "The ASA uses a network mask (for example, 255.255.255.0 for a Class C mask)," and that "The Cisco IOS mask uses wildcard bits (for example, 0.0.0.255)."
- **IPv6.** IOS XE IPv6 ACLs take a prefix, not a wildcard. The [IOS XE 16.7 guide](https://www.cisco.com/c/en/us/td/docs/ios-xml/ios/sec_data_acl/configuration/xe-16-7/sec-data-acl-xe-16-7-book/ip6-acls-xe.html) gives the syntax as `permit protocol {source-ipv6-prefix/prefix-length | any | host source-ipv6-address}`.
- **NX-OS.** Nexus switches accept either a prefix or a wildcard mask in an entry, per the guide quoted above, so check which form a pasted entry uses before reading its mask.

A quick sanity check for IOS: a wildcard written for an ordinary subnet has its 0 bits on the left and its 1 bits on the right, like 0.0.0.63. A wildcard that begins with 255 and is not the pair for `any` deserves a second look.

## How do you verify hit counts with show access-lists and account for the implicit deny?

Cisco's [ACL manageability guide](https://www.cisco.com/c/en/us/td/docs/ios-xml/ios/sec_data_acl/configuration/xe-17/sec-data-acl-xe-17-book/sec-dply-clr-ald-acl-xe.html) says "The system counts how many packets match (hit) each line of an access list," and its sample output shows the total in parentheses after each entry:

```text
Router# show ip access-list 150

Extended IP access list 150
   10 permit ip host 10.1.1.1 any (3 matches)
   30 permit ip host 10.2.2.2 any (27 matches)
```

A test sequence for the ACL above:

```text
Router# show ip interface GigabitEthernet0/1 | include access list
Router# clear ip access-list counters USERS-TO-SERVERS
Router# show ip access-lists USERS-TO-SERVERS
Router# show ip access-list interface GigabitEthernet0/1 in
```

The first command uses a field that Cisco's [interface command reference](https://www.cisco.com/c/en/us/td/docs/ios-xml/ios/interface/command/ir-cr-book/ir-s5.html) describes as showing "whether the interface has an incoming access list set," which confirms the ACL is bound to the interface and direction intended. The second resets the counters; per the [security command reference](https://www.cisco.com/c/en/us/td/docs/ios-xml/ios/security/a1/sec-a1-cr-book/sec-cr-c2.html), "If no name or number is specified, all IP access list counters are cleared," so name the list. The fourth, `show ip access-list interface`, is documented in the same ACL manageability guide and shows statistics for one interface and direction.

| Symptom | Likely cause | Check |
|---|---|---|
| A line expected to match shows no hits | Subnet mask typed as a wildcard, or the wrong interface or direction | Compare the wildcard with the calculation above; read the interface binding |
| A broad line collects traffic meant for a narrow one | An earlier entry matched first | Order of the sequence numbers |
| Everything is blocked | The list has no permit line | Cisco: "You must have at least one permit statement in an ACL or all traffic is blocked" |
| Traffic is dropped but no line counts it | The implicit deny did it | Add an explicit `deny ip any any` |

### Why does the implicit deny not show up?

Cisco's guide says "Every ACL has an implicit deny at the end for any traffic that is not explicitly permitted," but the implicit entry is not a line in the list, so it has no counter. Cisco's overview recommends an explicit deny and notes that "Only packets denied by explicit deny statements are counted." An [INE write-up](https://ine.com/blog/2010-01-02-ccna-the-explicit-deny-all) shows the effect: after adding `deny any log` to a standard ACL, `show access-lists` listed that line with "(5 matches)."

Skip the `log` keyword when the goal is only a count. Cisco's overview notes that "Packets matching an entry in an ACL with a log option are process switched" and says "It is not recommended to use the log option on ACLs," and that "The logging facility should not be used as a billing tool or an accurate source of the number of matches to an access list." The same INE example logged one denied packet to the console although five were counted.

Sequence numbers keep this editable. Cisco's [refining guide](https://www.cisco.com/c/en/us/td/docs/routers/ios/config/17-x/sec-vpn/b-security-vpn/m_sec-refine-ip-al-0.html) says the first entry gets number 10 with successive entries incremented by 10, and "entries currently in the access list can be resequenced to create room to insert the new entry," using `ip access-list resequence NAME start increment`. That makes it possible to insert a corrected line at the right position, delete the mistyped one with its `no` form, and clear the counters again.

## Sources

- [Cisco: Configure IP Access Lists (document 23602)](https://www.cisco.com/c/en/us/support/docs/security/ios-firewall/23602-confaccesslists.html)
- [Cisco: Configure Commonly Used IP ACLs (document 26448)](https://www.cisco.com/c/en/us/support/docs/ip/access-lists/26448-ACLsamples.html)
- [Cisco: IP Access List Overview, Security and VPN Configuration Guide, IOS XE 17.x](https://www.cisco.com/c/en/us/td/docs/ios-xml/ios/sec_data_acl/configuration/xe-17/sec-data-acl-xe-17-book/sec-access-list-ov.html)
- [Cisco: Creating an IP Access List and Applying It to an Interface, IOS XE 17](https://www.cisco.com/c/en/us/td/docs/ios-xml/ios/sec_data_acl/configuration/xe-17/sec-data-acl-xe-17-book/sec-create-ip-apply.html)
- [Cisco: Refining an IP Access List, IOS XE 17.x](https://www.cisco.com/c/en/us/td/docs/routers/ios/config/17-x/sec-vpn/b-security-vpn/m_sec-refine-ip-al-0.html)
- [Cisco: Displaying and Clearing IP Access List Data Using ACL Manageability, IOS XE 17](https://www.cisco.com/c/en/us/td/docs/ios-xml/ios/sec_data_acl/configuration/xe-17/sec-data-acl-xe-17-book/sec-dply-clr-ald-acl-xe.html)
- [Cisco: IOS Security Command Reference, Commands A to C (clear ip access-list counters)](https://www.cisco.com/c/en/us/td/docs/ios-xml/ios/security/a1/sec-a1-cr-book/sec-cr-c2.html)
- [Cisco: IOS Interface and Hardware Component Command Reference (show ip interface)](https://www.cisco.com/c/en/us/td/docs/ios-xml/ios/interface/command/ir-cr-book/ir-s5.html)
- [Cisco: IOS IP Routing OSPF Command Reference (network area)](https://www.cisco.com/c/en/us/td/docs/ios-xml/ios/iproute_ospf/command/iro-cr-book/ospf-i1.html)
- [Cisco: IP Routing Configuration Guide, IOS XE 17.x, Configuring OSPF](https://www.cisco.com/c/en/us/td/docs/routers/ios/config/17-x/ip-routing/b-ip-routing/m_iro-cfg-0.html)
- [Cisco: IPv6 Access Control Lists, IOS XE Fuji 16.7.x](https://www.cisco.com/c/en/us/td/docs/ios-xml/ios/sec_data_acl/configuration/xe-16-7/sec-data-acl-xe-16-7-book/ip6-acls-xe.html)
- [Cisco: Adding an Extended Access List, ASA 9.1 General Operations CLI Configuration Guide](https://www.cisco.com/c/en/us/td/docs/security/asa/asa91/configuration/general/asa_91_general_config/acl_extended.html)
- [Cisco: Configuring IP ACLs, Nexus 9000 NX-OS Security Configuration Guide, Release 7.x](https://www.cisco.com/c/en/us/td/docs/switches/datacenter/nexus9000/sw/7-x/security/configuration/guide/b_Cisco_Nexus_9000_Series_NX-OS_Security_Configuration_Guide_7x/b_Cisco_Nexus_9000_Series_NX-OS_Security_Configuration_Guide_7x_chapter_01001.html)
- [Cisco: CCNA Exam v1.1 (200-301) exam topics](https://learningcontent.cisco.com/documents/marketing/exam-topics/200-301-CCNA-v1.1.pdf)
- [IETF: RFC 4632, Classless Inter-domain Routing (CIDR)](https://www.rfc-editor.org/rfc/rfc4632)
- [IETF: RFC 1918, Address Allocation for Private Internets](https://www.rfc-editor.org/rfc/rfc1918)
- [INE: CCNA, The Explicit Deny All](https://ine.com/blog/2010-01-02-ccna-the-explicit-deny-all)
