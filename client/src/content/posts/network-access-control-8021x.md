
## The Problem 802.1X Solves

Without port authentication, anyone who can physically plug into a network jack can access the network. Visitors, contractors, attackers with physical access, or unauthorized personal devices all become part of the network the moment they connect a cable or join WiFi.

802.1X requires every device to authenticate before it receives network access. Until authenticated, the port only allows RADIUS traffic. After authentication, the port is placed in the appropriate VLAN for that device.

That description needs one correction, because getting it wrong leads to a broken deployment. The unauthenticated port does not carry RADIUS traffic; the client cannot reach the RADIUS server at all. What crosses the port before authentication is EAPOL, EAP over LAN, which is a layer 2 frame with EtherType 0x888E sent to the reserved multicast address 01:80:C2:00:00:03. The switch is the one that talks RADIUS, from its own management IP to the server, translating the EAP conversation as it goes. Cisco switches also permit CDP and STP through an unauthorized port, and nothing else.

## The Three Components

**Supplicant:** The device trying to connect. Must have an 802.1X client (built into Windows, macOS, and Linux).

**Authenticator:** The network switch or wireless AP. It enforces the authentication requirement and relays credentials to the RADIUS server.

**Authentication Server (RADIUS):** Validates credentials and tells the switch what access to grant. FreeRADIUS is the standard open-source option.

Those three names come straight out of IEEE 802.1X, and the EAP framework they exchange is RFC 3748. Worth understanding: EAP is a container, not an authentication method. The switch has no idea whether the inner method is a password, a certificate, or a token; it copies EAP payloads between the EAPOL frames on one side and the RADIUS `EAP-Message` attribute on the other. That is why you can change from PEAP to EAP-TLS without touching a single switch configuration line.

The methods you will actually meet:

- **EAP-TLS** (RFC 5216) uses a client certificate. It is the strongest option, gives mutual authentication, and needs a working PKI with certificate distribution and revocation. That PKI, not the 802.1X part, is the hard bit.
- **PEAP** and **EAP-TTLS** build a TLS tunnel using only a server certificate, then carry a password inside. Far easier to deploy because clients need no certificate of their own.
- **EAP-MD5** is a plain password challenge with no server authentication and no key derivation. It is trivially subject to a man in the middle and is unusable on wireless. Do not build anything new on it.

## Basic FreeRADIUS Setup

```bash
# Install
apt install freeradius

# Add clients (the switches that will query RADIUS)
# In /etc/freeradius/3.0/clients.conf:
client switch1 {
  ipaddr = 192.168.1.10
  secret = radius-secret-here
}

# Add users (or integrate with Active Directory)
# In /etc/freeradius/3.0/users:
jsmith  Cleartext-Password := "password123"
```

The `ipaddr` in `clients.conf` must be the source address the switch actually uses, which is not always the one you think. A switch with several SVIs picks a source by routing table unless you pin it with `ip radius source-interface Vlan10`. When the source does not match, FreeRADIUS logs `Ignoring request from unknown client` and the switch reports a timeout, so the two ends describe completely different problems.

Do not debug this from the log files. Stop the service and run `freeradius -X` to get full debug output in the foreground. It prints the incoming packet, every module it runs, the attributes it decides to return, and the exact reason for a reject. It is the single most useful troubleshooting tool in the stack and most people find it a year late.

Take the shared secret seriously. RADIUS is defined in RFC 2865, and its only protection is that secret: the `User-Password` attribute is obscured with an MD5 keystream derived from the secret and the request authenticator, and every other attribute, including the username and the VLAN assignment coming back, travels in cleartext UDP. A short or reused secret undoes the whole design. Use a long random string, a different one per switch, and put the RADIUS traffic on a management VLAN.

Two more RADIUS numbers worth memorising. The modern ports are UDP 1812 for authentication and 1813 for accounting (RFC 2866); the legacy 1645 and 1646 still appear in old documentation and in the defaults of some ancient gear, and a mismatch there is a silent timeout. And a RADIUS packet maxes out at 4096 octets, with any single attribute capped at 253 bytes of data. EAP messages larger than that get split across multiple `EAP-Message` attributes. This is why EAP-TLS with a long certificate chain fails when smaller methods work: the fragmented exchange is more sensitive to MTU problems and to intermediate devices that do not reassemble properly.

## Cisco Switch Configuration

```
aaa new-model
aaa authentication dot1x default group radius
dot1x system-auth-control

radius server RADIUS-SRV
  address ipv4 192.168.1.50 auth-port 1812
  key radius-secret-here

interface GigabitEthernet1/0/1
  authentication port-control auto
  dot1x pae authenticator
```

`aaa new-model` is the command that changes everything else, and it is the one that will lock you out. The moment you type it, the switch switches to the AAA authentication model, and if you have not already configured a fallback for console and VTY lines, your next login attempt fails. Configure the fallback in the same session, before you disconnect:

```
aaa authentication login default local
username admin privilege 15 secret <password>
```

`aaa authentication login default group radius local` is the usual production form, meaning try RADIUS and fall back to the local account if the server is unreachable. Without that `local` keyword, a RADIUS outage means nobody can log into any switch, which turns a server problem into a network-wide one.

Also add `aaa authorization network default group radius`. Without it the switch will authenticate users correctly and then ignore every attribute the server sends back, including the VLAN. Authentication succeeding while dynamic VLAN assignment does nothing is almost always this line missing.

Note that `authentication port-control auto` is the older IOS syntax. Current IOS XE uses Identity-Based Networking Services with `access-session port-control auto` and policy maps. Both appear in current documentation, so match your platform rather than the first guide you find.

## Dynamic VLAN Assignment

The real power of 802.1X is RADIUS-based VLAN assignment. Employees get the corporate VLAN; contractors get the guest VLAN. This happens automatically based on credentials, without manual VLAN configuration per port.

Configure RADIUS to return VLAN attributes in the Access-Accept response, and the switch automatically places the port in the correct VLAN.

The attributes are standardised, and RFC 3580 spells out exactly which three you need together:

```
jsmith  Cleartext-Password := "password123"
        Tunnel-Type = VLAN,
        Tunnel-Medium-Type = IEEE-802,
        Tunnel-Private-Group-Id = "100"
```

`Tunnel-Type` must be `VLAN` (value 13), `Tunnel-Medium-Type` must be `IEEE-802` (value 6), and `Tunnel-Private-Group-Id` carries the VLAN number or name. Send only `Tunnel-Private-Group-Id` and the switch ignores it entirely, which is the most common reason "VLAN assignment does not work" while authentication succeeds. All three, or none of them count. The attributes themselves come from RFC 2868.

## The Failure Modes That Matter

**Devices with no supplicant.** Printers, IP cameras, badge readers, and older embedded gear have no 802.1X client at all and will never authenticate. Cisco's default timers give them 30 seconds per attempt with two retries, so roughly 90 seconds of nothing before the port gives up. The answers are MAC Authentication Bypass, which authenticates the device's MAC address as a username against RADIUS, and a guest VLAN for ports where nothing ever speaks EAPOL. MAB is weak by design, since a MAC address is readable off a label and trivially spoofed, so put MAB devices in a tightly restricted VLAN rather than treating a MAB pass as trust.

**Deploying in enforcement mode first.** Turning on 802.1X across a campus without a discovery phase takes out every device you did not know about, and you find out at 8 a.m. Every serious deployment starts in monitor mode, Cisco's `authentication open`, where the port authenticates and logs but permits traffic regardless of outcome. Run that for weeks, read the RADIUS logs, fix or MAB everything that fails, and only then close the ports.

**IP phones with a PC behind them.** One switch port, two devices, two [VLANs](/blog/vlan-segmentation-guide). That needs multi-domain authentication, `authentication host-mode multi-domain`, so the phone authenticates into the voice VLAN and the PC into the data VLAN independently. Single-host mode allows exactly one MAC address and will shut the port when it sees the second.

**Certificate expiry.** With EAP-TLS or PEAP, the RADIUS server's own certificate has an expiry date. When it passes, every client on the network fails authentication simultaneously. Put that date in a calendar and monitor it, because the outage is total and the error clients report is unhelpful.

**Physical layer bypass.** 802.1X authenticates once, at link-up. An attacker who inserts a small hub or bridge between an already-authenticated legitimate device and the wall jack can inject traffic onto the authenticated port. MACsec (IEEE 802.1AE) encrypts and authenticates each frame and closes this hole; plain 802.1X does not. It also does nothing about a compromised machine that authenticated legitimately, which is the case for pairing it with posture assessment or a NAC platform rather than treating it as the whole answer.

On the supplicant side, plan for the client experience. Windows has a `Wired AutoConfig` service that is set to manual start by default, so a correctly configured Windows machine will fail 802.1X until that service runs. Linux uses `wpa_supplicant` for wired 802.1X too, not just wireless, and it needs an explicit config file. These are not exotic edge cases; they are what your first week of monitor-mode logs will be full of.

## References

- https://www.rfc-editor.org/rfc/rfc3748
- https://www.rfc-editor.org/rfc/rfc2865
- https://www.rfc-editor.org/rfc/rfc3580
- https://www.rfc-editor.org/rfc/rfc5216
- https://www.cisco.com/c/en/us/td/docs/switches/lan/catalyst9300/software/release/17-9/configuration_guide/sec/b_179_sec_9300_cg/configuring_ieee_802_1x_port_based_authentication.html
- https://en.wikipedia.org/wiki/IEEE_802.1X
