
## The chain nobody draws

Network boot fails in confusing ways because it is four protocols pretending
to be one feature. Trace it once and the failures become obvious.

The firmware brings up the link and sends a DHCP request that includes a
vendor class of `PXEClient` and option 93, the client system architecture. The
DHCP server answers with an address plus two extra things: the next server to
talk to, and a boot file name. The firmware fetches that file, usually over
TFTP, occasionally over HTTP on modern UEFI. That file is the Network Bootstrap
Program, and it is small on purpose. The NBP then does the real work: it
fetches a config, a kernel, and an initrd, and hands control to the kernel,
which fetches an unattended install file over HTTP and runs the installer.

Four hops, four places to break, and each one fails with a different symptom.

## BIOS and UEFI are different clients

Option 93 is the field that matters most, and getting it wrong is the single
most common cause of "PXE-E" errors on mixed hardware. Legacy BIOS clients
report architecture 0. IA32 UEFI reports 6. Most x86-64 UEFI firmware reports
7, some report 9, and 64 bit Arm reports 11. They need different boot files.
A BIOS NBP handed to a UEFI machine simply does not execute.

This dnsmasq configuration tags clients by architecture and serves the right
loader to each:

```ini
# /etc/dnsmasq.d/pxe.conf
interface=lab0
bind-interfaces
dhcp-range=192.0.2.100,192.0.2.200,12h
enable-tftp
tftp-root=/srv/tftp

# Tag by the architecture the client reports in DHCP option 93
dhcp-match=set:bios,option:client-arch,0
dhcp-match=set:efi32,option:client-arch,6
dhcp-match=set:efi64,option:client-arch,7
dhcp-match=set:efi64,option:client-arch,9
dhcp-match=set:arm64,option:client-arch,11

# iPXE identifies itself with option 175, which breaks the chainload loop
dhcp-match=set:ipxe,175

dhcp-boot=tag:bios,tag:!ipxe,undionly.kpxe
dhcp-boot=tag:efi32,tag:!ipxe,ipxe32.efi
dhcp-boot=tag:efi64,tag:!ipxe,ipxe.efi
dhcp-boot=tag:arm64,tag:!ipxe,ipxe-arm64.efi
dhcp-boot=tag:ipxe,http://192.0.2.10/boot.ipxe
```

The `tag:!ipxe` conditions are the part people miss. Once iPXE loads, it sends
its own DHCP request. Without a way to tell the second request from the first,
the server hands iPXE a copy of iPXE, which loads and asks again, forever. The
option 175 match is how you break that loop.

## The second stage is where the logic lives

Keep the firmware stage dumb and put every decision in the second stage. TFTP
has no authentication, no encryption, and a tiny window, so it should move one
small file and then get out of the way. iPXE can speak HTTP, which is faster,
proxy friendly, and much easier to log.

```
#!ipxe

set base http://192.0.2.10/os
echo Booting ${net0/mac} on ${platform}

# Per host override: MAC keyed scripts win, otherwise fall through to the menu
chain --autofree ${base}/hosts/${net0/mac:hexhyp}.ipxe || goto menu

:menu
menu Lab provisioning
item install   Install base OS (wipes disk)
item rescue    Boot rescue environment
item local     Boot from local disk
choose --default local --timeout 15000 target || goto local
goto ${target}

:install
kernel ${base}/vmlinuz initrd=initrd.img ip=dhcp autoinstall ds=nocloud-net;s=${base}/autoinstall/
initrd ${base}/initrd.img
boot

:rescue
kernel ${base}/rescue/vmlinuz initrd=initrd.img ip=dhcp
initrd ${base}/rescue/initrd.img
boot

:local
exit
```

Because the MAC keyed lookup runs first, adding one file to a web root is
enough to give a specific machine a different build. No DHCP change, no
service reload.

## Network boot is an unauthenticated trust decision

A machine that network boots hands total control to whoever answers its DHCP
request first. There is no signature check in the classic flow, and DHCP is a
race. On a flat network, anyone who can plug in a laptop can serve your
servers a boot image.

How I treat that:

- Provisioning lives on a dedicated VLAN that is not the user VLAN, with
  [DHCP snooping](/blog/dhcp-snooping-arp-inspection) upstream so only the real server can answer.
- Second stage transfers use HTTP inside that segment and HTTPS when they
  cross a boundary. iPXE can be built with a trusted CA baked in.
- Secure Boot machines chain a signed shim rather than a raw loader, so the
  firmware verifies the next stage instead of trusting the network.
- PXE is disabled in firmware once a machine is in service. A production
  server should not try to net boot after a power cut.
- Installer files that carry credentials get served once and expire, not left
  in a world readable web root forever.

None of that makes PXE secure by itself. It just means the blast radius is a
segment you control rather than the whole lab.

## Troubleshooting order

Work the chain in order and you will find it fast.

```bash
# 1. Is the client even asking, and what arch does it claim?
tcpdump -ni lab0 -v 'port 67 or port 68'

# 2. Did the server answer with a filename, and did TFTP move bytes?
tcpdump -ni lab0 'port 69 or icmp'
journalctl -u dnsmasq -f

# 3. Can you fetch what you promised, from the client's point of view?
tftp 192.0.2.10 -c get ipxe.efi
curl -sfI http://192.0.2.10/boot.ipxe
```

Three symptoms cover most cases. No DHCP offer at all usually means the client
is on the wrong VLAN or [spanning tree](/blog/spanning-tree-protocol-deep-dive) has not converged before the firmware
gives up, which is what portfast on access ports is for. An offer followed by
a timeout usually means the firewall is blocking the TFTP data transfer, since
the server replies from an ephemeral UDP port rather than 69. A loader that
starts and then stalls is nearly always the architecture tag being wrong or a
path that is correct on the server and wrong relative to the TFTP root.

## References

- [RFC 2131: Dynamic Host Configuration Protocol](https://www.rfc-editor.org/rfc/rfc2131)
- [RFC 1350: The TFTP Protocol (Revision 2)](https://www.rfc-editor.org/rfc/rfc1350)
- [RFC 4578: DHCP Options for the Intel Preboot eXecution Environment](https://www.rfc-editor.org/rfc/rfc4578)
- [RFC 5970: DHCPv6 Options for Network Boot](https://www.rfc-editor.org/rfc/rfc5970)
- [iPXE documentation](https://ipxe.org/)
- [UEFI specifications](https://uefi.org/specifications)
