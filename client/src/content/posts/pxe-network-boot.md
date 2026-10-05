
## Why I Bother With Network Boot

Installing an operating system from removable media is fine once. It stops being
fine the third time, and it stops being possible at all when the machine is in a
rack and you are not. Network boot fixes that, and it does something more
valuable along the way: it turns provisioning into a config file. A host that
boots from the network is a host whose install is reproducible, reviewable, and
diffable.

The reason people find PXE frustrating is that it is not one protocol. It is a
short conversation between firmware, DHCP, a file transfer, and a bootloader,
and any of the four can fail in a way that looks identical from the console.
Once you can name the steps, the failures separate cleanly.

## The Handshake, Step By Step

The client firmware brings up the link and sends a DHCPDISCOVER, but with extra
options attached. Option 60 carries a vendor class identifier, conventionally
the string PXEClient, which tells the server this is a network boot attempt
rather than an ordinary lease request. Option 93 carries the client system
architecture as a numeric code, option 94 carries the network interface
identifier, and option 97 carries a UUID that identifies the machine itself.

The server replies with an address as usual, plus boot instructions. Classically
those are the `siaddr` field naming the boot server and the `file` field naming
the boot program, or equivalently options 66 and 67. The client then fetches
that file, historically over TFTP, though modern UEFI firmware can also make
this first fetch over HTTP.

The file it fetches is the network bootstrap program. That program is small on
purpose: its job is to pull down whatever comes next, typically a configuration,
then a kernel and an initial ramdisk. Modern setups chain immediately from the
tiny TFTP stage to HTTP, because TFTP over UDP with small blocks is slow and
fragile over anything but a quiet LAN. Every block waits for its own
acknowledgment, so throughput is roughly one block per round trip, and there is
no authentication or integrity check worth the name. TFTP is in the chain
because it is small enough to fit in a network card's option ROM, not because it
is good.

Finally the kernel boots with a command line supplied by that configuration,
which is where you point it at an automated install answer file.

## BIOS And UEFI Want Different Files

This is the single most common cause of a boot that gets an address and then
stops. Legacy BIOS clients and UEFI clients need different bootstrap binaries,
and a UEFI machine handed a BIOS bootstrap simply fails. The failure is quiet,
too: the firmware either does nothing visible or falls through to the next boot
device, which reads to the operator as "PXE did not work."

Option 93 is how you tell them apart. The value 0 means legacy x86 BIOS. The
values 7 and 9 both appear in the wild for x86-64 UEFI. The value 11 is UEFI on
arm64, and 6, which you will rarely meet, is 32 bit x86 UEFI. The full list is a
registry maintained by IANA and defined in RFC 4578, and it grows, so match on
the values you actually observe rather than assuming.

Here is a minimal dnsmasq configuration that serves both. dnsmasq is a
reasonable choice for a lab because DHCP and TFTP live in one process and one
file.

```ini
# /etc/dnsmasq.d/pxe.conf
interface=eth1
bind-interfaces

dhcp-range=192.0.2.100,192.0.2.200,12h
dhcp-option=option:router,192.0.2.1
dhcp-option=option:dns-server,192.0.2.1

# Classify clients by the architecture they report in option 93.
dhcp-match=set:bios,option:client-arch,0
dhcp-match=set:efi64,option:client-arch,7
dhcp-match=set:efi64,option:client-arch,9
dhcp-match=set:efiarm64,option:client-arch,11

# Hand each class the bootstrap it can actually execute.
dhcp-boot=tag:bios,pxelinux.0,pxeserver,192.0.2.10
dhcp-boot=tag:efi64,bootx64.efi,pxeserver,192.0.2.10
dhcp-boot=tag:efiarm64,bootaa64.efi,pxeserver,192.0.2.10

enable-tftp
tftp-root=/srv/tftp
tftp-secure
log-dhcp
```

`log-dhcp` is not optional while you are building this. It prints the vendor
class and architecture each client sent, which is how you learn what your
hardware actually reports instead of what the documentation says it should.

## Where It Breaks

Address but no file. The client got a lease, so DHCP works, but the bootstrap
name or the boot server is wrong or the file is not readable. Test the transfer
by hand from another machine.

```bash
# Fetch the bootstrap the way the client would.
tftp 192.0.2.10 -c get bootx64.efi && ls -l bootx64.efi

# Watch the exchange if that fails. -v decodes the DHCP options,
# including the architecture the client claims.
sudo tcpdump -ni eth1 -v 'port 67 or port 68 or port 69'
journalctl -u dnsmasq -f
```

A lease with no boot file can also mean the client took its offer from a
different DHCP server, one that knows nothing about booting. Two DHCP servers on
one broadcast domain is a race, and the loser is whichever one you configured.

No DHCP offer at all on a routed network. Broadcasts do not cross a router, so
the client on a different VLAN never reaches your server. The fix is a DHCP
relay, configured on the gateway interface for that VLAN. On Cisco style
hardware that is `ip helper-address` pointing at the DHCP server.

No offer on the same VLAN either. Watch the `log-dhcp` output. If the DISCOVER
never shows up, the problem is layer 2, not boot, and the port is probably in
the wrong VLAN. If dnsmasq logs an offer the client never receives, check
whether [DHCP snooping](/blog/dhcp-snooping-arp-inspection) or a rogue server
guard on the switch is eating it. The boot server's port has to be marked
trusted.

A long pause and then a timeout. [Spanning tree](/blog/spanning-tree-protocol-deep-dive). A port that has just come up
spends time in listening and learning before it forwards, and the firmware's
DHCP retry budget can expire first. Edge port or portfast on access ports fixes
this and is correct regardless. It can bite a second time when the installer's
kernel takes over the network card and the link renegotiates, which looks like a
machine that boots fine and then cannot reach anything.

The transfer starts and stalls. TFTP negotiates a block size, and a firmware
implementation that asks for a large one on a path that cannot carry it will
hang partway. Reducing the block size is the diagnostic.

The bootstrap loads and then stalls. Look at what it asks for next. Its
configuration and kernel paths have to be right relative to `tftp-root`, which
is the only part of the filesystem the client can see, and a path that is
correct on the server can still be wrong from there.

Firewall on the boot server. TFTP replies come from an ephemeral source port,
not from port 69, so a naive rule that only allows 69 permits the request and
drops the data. Use the connection tracking helper for TFTP or open the range.

Secure Boot. If it is enabled, the bootstrap and everything it chainloads must
be signed by a key the firmware trusts. The usual answer is to chain through a
small signed first stage, a shim, which then verifies the next stage itself.
This is worth keeping on and worth knowing about before you spend an hour on it.

## Beyond TFTP, And Where I Would Start

Once the basic path works, the upgrade that pays for itself is chainloading
iPXE. You serve a small iPXE binary over TFTP, and iPXE then does everything
else over HTTP, with scripting, retries, and the ability to boot from a URL you
generate per host. Installing a full distribution over HTTP instead of TFTP
turns a multi minute crawl into something reasonable.

There is one trap, and every setup hits it once. iPXE sends its own DHCP request
when it starts, and unless the server can tell that request from the firmware's,
it hands iPXE a copy of iPXE, which loads and asks again, forever. iPXE includes
option 175 in its requests, so tag on that and guard each first stage line.
These replace the `dhcp-boot` lines above:

```ini
# iPXE identifies itself with option 175.
dhcp-match=set:ipxe,175

# First pass: firmware gets an iPXE binary over TFTP.
dhcp-boot=tag:bios,tag:!ipxe,undionly.kpxe,pxeserver,192.0.2.10
dhcp-boot=tag:efi64,tag:!ipxe,ipxe.efi,pxeserver,192.0.2.10
dhcp-boot=tag:efiarm64,tag:!ipxe,ipxe-arm64.efi,pxeserver,192.0.2.10

# Second pass: iPXE is running, so send it to a script over HTTP.
dhcp-boot=tag:ipxe,http://192.0.2.10/boot.ipxe
```

Keep the firmware stage dumb and put every decision in that script. A lookup
keyed on the MAC address runs first, so dropping one file into the web root
gives a specific machine a different build, with no DHCP change and no service
reload. Everything else gets a menu that defaults to the local disk, so a
machine that net boots by accident does not reinstall itself.

```
#!ipxe
set base http://192.0.2.10/os

# A script named after this machine's MAC wins, otherwise show the menu.
chain --autofree ${base}/hosts/${net0/mac:hexhyp}.ipxe || goto menu

:menu
menu Lab provisioning
item install Install base OS (wipes disk)
item local   Boot from local disk
choose --default local --timeout 15000 target || goto local
goto ${target}

:install
# Ubuntu's live installer: fetch the ISO, then the autoinstall answer file.
kernel ${base}/vmlinuz initrd=initrd.img root=/dev/ram0 ramdisk_size=1500000 ip=dhcp url=${base}/ubuntu-server.iso autoinstall ds=nocloud-net;s=${base}/autoinstall/
initrd ${base}/initrd.img
boot

:local
exit
```

Test the HTTP stage from another machine before any client depends on it:
`curl -sfI http://192.0.2.10/boot.ipxe` should succeed.

For IPv6 the pieces are the same but the options differ. RFC 5970 defines the
boot file URL option for DHCPv6, which is a cleaner design than the original
because it carries a URL directly instead of a filename plus a separate server
address.

Build it on an isolated VLAN first. A second DHCP server on a production
segment is a fast way to break things for everyone, and PXE work involves
restarting the DHCP daemon a lot. Get one architecture booting end to end before
you add the second. And keep `log-dhcp` and a packet capture running the whole
time, because every failure in this chain is visible on the wire and almost none
of them are visible on the client console.

## Network Boot Is A Trust Decision

A machine that network boots hands total control to whoever answers its DHCP
request first. There is no signature check in the classic flow, and DHCP is a
race, so on a flat network anyone who can plug in a laptop can serve your
servers a boot image. How I treat that:

- Provisioning stays on that isolated VLAN, not the user VLAN, with DHCP
  snooping upstream so only the real server can answer.
- Second stage transfers use HTTP inside that segment and HTTPS when they cross
  a boundary. iPXE can be built with a trusted CA baked in.
- Secure Boot stays on, with the signed shim chain, so the firmware verifies the
  next stage instead of trusting the network.
- PXE is disabled in firmware once a machine is in service. A production server
  should not try to net boot after a power cut.
- Installer files that carry credentials are served once and expire, not left in
  a world readable web root forever.

None of that makes PXE secure by itself. It just means the blast radius is a
segment you control rather than the whole lab.

## References

- [RFC 2131: Dynamic Host Configuration Protocol](https://www.rfc-editor.org/rfc/rfc2131.html)
- [RFC 2132: DHCP Options and BOOTP Vendor Extensions](https://www.rfc-editor.org/rfc/rfc2132.html)
- [RFC 4578: DHCP Options for the Intel Preboot eXecution Environment](https://www.rfc-editor.org/rfc/rfc4578.html)
- [RFC 1350: The TFTP Protocol (Revision 2)](https://www.rfc-editor.org/rfc/rfc1350.html)
- [RFC 5970: DHCPv6 Options for Network Boot](https://www.rfc-editor.org/rfc/rfc5970.html)
- [iPXE open source boot firmware](https://ipxe.org/)
- [iPXE documentation](https://ipxe.org/docs)
- [UEFI specifications](https://uefi.org/specifications)
