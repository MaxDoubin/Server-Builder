
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
architecture as a numeric code, and option 94 carries the network interface
identifier.

The server replies with an address as usual, plus boot instructions. Classically
those are the `siaddr` field naming the boot server and the `file` field naming
the boot program, or equivalently options 66 and 67. The client then fetches
that file, historically over TFTP.

The file it fetches is the network bootstrap program. That program is small on
purpose: its job is to pull down whatever comes next, typically a configuration,
then a kernel and an initial ramdisk. Modern setups chain immediately from the
tiny TFTP stage to HTTP, because TFTP over UDP with small blocks is slow and
fragile over anything but a quiet LAN.

Finally the kernel boots with a command line supplied by that configuration,
which is where you point it at an automated install answer file.

## BIOS And UEFI Want Different Files

This is the single most common cause of a boot that gets an address and then
stops. Legacy BIOS clients and UEFI clients need different bootstrap binaries,
and a UEFI machine handed a BIOS bootstrap simply fails.

Option 93 is how you tell them apart. The value 0 means legacy x86 BIOS. The
values 7 and 9 both appear in the wild for x86-64 UEFI. The value 11 is UEFI on
arm64. The full list is a registry maintained by IANA and defined in RFC 4578,
and it grows, so match on the values you actually observe rather than assuming.

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

# Watch the exchange if that fails.
sudo tcpdump -ni eth1 'port 67 or port 68 or port 69'
```

No DHCP offer at all on a routed network. Broadcasts do not cross a router, so
the client on a different VLAN never reaches your server. The fix is a DHCP
relay, configured on the gateway interface for that VLAN. On Cisco style
hardware that is `ip helper-address` pointing at the DHCP server.

A long pause and then a timeout. Spanning tree. A port that has just come up
spends time in listening and learning before it forwards, and the firmware's
DHCP retry budget can expire first. Edge port or portfast on access ports fixes
this and is correct regardless.

The transfer starts and stalls. TFTP negotiates a block size, and a firmware
implementation that asks for a large one on a path that cannot carry it will
hang partway. Reducing the block size is the diagnostic.

Firewall on the boot server. TFTP replies come from an ephemeral source port,
not from port 69, so a naive rule that only allows 69 permits the request and
drops the data. Use the connection tracking helper for TFTP or open the range.

Secure Boot. If it is enabled, the bootstrap and everything it chainloads must
be signed by a key the firmware trusts. This is worth keeping on and worth
knowing about before you spend an hour on it.

## Beyond TFTP, And Where I Would Start

Once the basic path works, the upgrade that pays for itself is chainloading
iPXE. You serve a small iPXE binary over TFTP, and iPXE then does everything
else over HTTP, with scripting, retries, and the ability to boot from a URL you
generate per host. Installing a full distribution over HTTP instead of TFTP
turns a multi minute crawl into something reasonable.

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

## References

- [RFC 2131: Dynamic Host Configuration Protocol](https://www.rfc-editor.org/rfc/rfc2131.html)
- [RFC 2132: DHCP Options and BOOTP Vendor Extensions](https://www.rfc-editor.org/rfc/rfc2132.html)
- [RFC 4578: DHCP Options for the Intel Preboot eXecution Environment](https://www.rfc-editor.org/rfc/rfc4578.html)
- [RFC 1350: The TFTP Protocol (Revision 2)](https://www.rfc-editor.org/rfc/rfc1350.html)
- [RFC 5970: DHCPv6 Options for Network Boot](https://www.rfc-editor.org/rfc/rfc5970.html)
- [iPXE open source boot firmware](https://ipxe.org/)
