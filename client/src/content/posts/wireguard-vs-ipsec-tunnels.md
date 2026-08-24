
## Two different philosophies, not two versions of the same thing

IPsec and WireGuard both give you an encrypted tunnel between networks, and
that surface similarity hides how differently they are built. IPsec is a
family of protocols standardised over decades, with a negotiation layer, a
policy database, and enough options to interoperate with basically anything.
WireGuard is a single protocol with a fixed cryptographic construction and
deliberately few knobs.

That difference drives every practical comparison below, so it is worth
stating plainly: IPsec optimises for interoperability and policy expression,
WireGuard optimises for a small implementation and a simple mental model.

## Cryptographic agility versus a fixed suite

IPsec negotiates. IKEv2 runs a handshake in which both ends agree on
encryption, integrity, key exchange group, and lifetimes, from a proposal
list you configure. That flexibility is what lets a modern firewall talk to a
device from another vendor and another era. It is also the source of most
IPsec misconfiguration: mismatched proposals, mismatched lifetimes, and a
long tail of weak options that are still selectable.

WireGuard does not negotiate. It specifies one construction, built on the
Noise protocol framework, with a fixed set of primitives. There is no
proposal list, so there is nothing to mismatch and no downgrade to negotiate
into. The trade is that changing algorithms means changing the protocol
version, not editing a config. For a small network that is a good trade. For
an organisation that has to satisfy a specific cryptographic policy or talk
to equipment it does not control, agility is a feature, not a bug.

## The routing model is the real difference

This is the part that surprises people moving between them.

IPsec, in its tunnel mode form, evaluates traffic against a security policy
database. You define traffic selectors, effectively "traffic from this prefix
to that prefix gets this security association," and the kernel matches
packets against those selectors. Route based implementations put a virtual
interface in front of that so you can use ordinary routing, which is what
most modern deployments do, but the policy layer is still there.

WireGuard uses what its author calls cryptokey routing. Each peer has a
public key and a list of allowed IPs. That list does double duty: outbound,
it decides which peer a packet is sent to; inbound, it decides which source
addresses that peer is permitted to use. One list, both directions.

```ini
[Interface]
Address = 10.99.0.1/24
ListenPort = 51820
PrivateKey = <this host's private key>
MTU = 1420

[Peer]
# Branch site
PublicKey = <peer public key>
AllowedIPs = 10.99.0.2/32, 192.168.50.0/24
PersistentKeepalive = 25
```

That `AllowedIPs` line is the whole access control model. If a prefix is not
listed, packets from the peer claiming that source are dropped, and packets
destined there are not sent to that peer. It is elegant and it is unforgiving:
a typo in a prefix is a silent connectivity hole, and there is no separate
"allow" rule to double check it against.

## Operational differences that actually bite

**Statelessness and roaming.** WireGuard has no long lived session state to
speak of and identifies peers by key, so a peer that changes IP address
simply keeps working once it sends an authenticated packet from the new
address. IPsec generally needs to rekey or use mobility extensions. For
anything on a mobile connection this matters a lot.

**Silence.** A WireGuard endpoint does not respond to unauthenticated
packets. From a scanner's point of view the port is a black hole, which is a
genuinely nice property. It also means "is the tunnel up" is answered by
looking at the last handshake time, not by probing the port.

```bash
wg show wg0 latest-handshakes
wg show wg0 transfer
ip -brief address show wg0
```

**NAT traversal.** IPsec has an established mechanism for encapsulating in
UDP when a NAT is in the path. WireGuard is UDP already, so the problem
mostly does not arise, but you do need `PersistentKeepalive` on the side
behind NAT to keep the mapping alive.

**MTU.** Both add overhead, and both will give you the stalled-transfer
symptom if you ignore it. Set the tunnel MTU explicitly and clamp TCP MSS at
the edge rather than hoping path MTU discovery survives the internet.

**Auditing and identity.** IPsec with IKEv2 can authenticate with
certificates, which plugs into an existing PKI and gives you revocation and
expiry. WireGuard peers are raw keys in a config file. For a handful of sites
that is simpler. For hundreds of users with a joiner/mover/leaver process, a
certificate story is worth real money, and in practice people build
orchestration on top of WireGuard to fill that gap.

## What I reach for

For lab to lab links, site to site between networks I control, and remote
access for myself, I use WireGuard. The config fits on a screen, the failure
modes are few, and the performance overhead is low because the data path is
short and lives in the kernel.

For anything that has to terminate on somebody else's equipment, satisfy a
written cryptographic requirement, or authenticate users against an existing
identity system, IPsec is still the answer, and I would rather configure it
carefully than pretend the requirement does not exist.

The wrong reason to pick either is "the other one is old." IPsec is old in
the sense that TCP is old. The right reasons are: who is on the other end,
what identity model you need, and how many people have to maintain it after
you build it.

## References

- [WireGuard whitepaper](https://www.wireguard.com/papers/wireguard.pdf)
- [WireGuard protocol overview](https://www.wireguard.com/protocol/)
- [Noise Protocol Framework](https://noiseprotocol.org/)
- [RFC 4301: Security Architecture for the Internet Protocol](https://www.rfc-editor.org/rfc/rfc4301.html)
- [RFC 7296: Internet Key Exchange Protocol Version 2](https://www.rfc-editor.org/rfc/rfc7296.html)
