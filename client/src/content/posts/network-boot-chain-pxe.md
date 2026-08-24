
## Why Bother With Network Boot

The reason is not that plugging in a USB stick is hard. The reason is that a
machine which can boot from the network is a machine you never have to touch to
reinstall. Reprovisioning becomes a config change plus a power cycle, and that
changes how freely you experiment. Wiping a box stops being a chore and starts
being a normal operation.

It is also one of the clearest examples of protocol layering you will find in
practice, and almost every failure is "the wrong leg of the relay handed off
the wrong thing." Once you can name the legs, you can bisect quickly.

## DHCP Is Doing Two Jobs

The first surprise is that DHCP is not just handing out an address. In a
network boot it is also telling the firmware where to get its bootloader, and
it needs to tell different firmware different things.

The client speaks first, and it identifies itself. Option 93, client system
architecture, says whether this is legacy BIOS, 32 bit UEFI, 64 bit UEFI, or
something else. Option 94 and option 97 carry the network interface identifier
and a machine identifier. Your DHCP server is supposed to read option 93 and
answer accordingly, because a UEFI machine handed a BIOS boot file will simply
refuse.

The server answers with the next server address, historically option 66, and
the boot file name, option 67. That is the whole handoff: "here is who to ask,
and here is what to ask for."

## TFTP, Firmware Flavours, And Secure Boot

Firmware traditionally fetches that boot file over TFTP, which is about the
simplest file transfer protocol that works. It runs over UDP, it has a lockstep
acknowledgement per block, and it has no authentication and no integrity check
worth the name. It is in the chain because it is small enough to fit in a
network card's option ROM, not because it is good.

TFTP's lockstep design means throughput is roughly one block per round trip, so
pulling a large initrd over it is painfully slow. The standard move is to use
TFTP only to load a smarter bootloader, then have that bootloader fetch
everything else over HTTP. A chainloading setup like that is the difference
between a boot that takes minutes and one that takes seconds, and it gets you
scripting, retries, and sane error messages as a bonus.

Which loader you serve is where most people get stuck. The boot file you serve is
architecture specific:

- Legacy BIOS clients want a small real mode binary.
- 64 bit UEFI clients want a `.efi` executable built for x64.
- UEFI on 64 bit Arm wants a different `.efi` again.

Serve the wrong one and the firmware either does nothing visible or drops back
to the next boot device, which reads to the operator as "PXE did not work."

Secure Boot adds another gate. With it enabled, the firmware verifies the
signature on the loaded EFI binary against keys it trusts, so an unsigned
bootloader is rejected. The usual answer is to chain through a small signed
first stage that then verifies the next stage itself. You can also turn Secure
Boot off for a provisioning VLAN, which is a legitimate tradeoff as long as you
made it on purpose and wrote it down.

## Expressing The Whole Thing In One Config

`dnsmasq` is convenient here because it can be DHCP server and TFTP server at
once, and its match syntax makes the architecture branching readable.

```ini
# /etc/dnsmasq.d/netboot.conf
interface=eth1
bind-interfaces

dhcp-range=192.0.2.100,192.0.2.200,12h
dhcp-option=option:router,192.0.2.1
dhcp-option=option:dns-server,192.0.2.1

# Built-in TFTP server.
enable-tftp
tftp-root=/srv/tftp

# Tag clients by DHCP option 93 (client system architecture).
dhcp-match=set:bios,option:client-arch,0
dhcp-match=set:uefi64,option:client-arch,7
dhcp-match=set:uefi64,option:client-arch,9
dhcp-match=set:uefiarm,option:client-arch,11

# Tag clients that are already running iPXE so we do not loop.
dhcp-match=set:ipxe,175

# First pass: hand each architecture the right loader over TFTP.
dhcp-boot=tag:bios,tag:!ipxe,undionly.kpxe
dhcp-boot=tag:uefi64,tag:!ipxe,ipxe.efi
dhcp-boot=tag:uefiarm,tag:!ipxe,ipxe-arm64.efi

# Second pass: iPXE is running, send it to a script over HTTP.
dhcp-boot=tag:ipxe,http://192.0.2.10/boot.ipxe

log-dhcp
log-queries
```

The `tag:!ipxe` guard is load bearing. Without it, iPXE gets told to load iPXE,
which loads iPXE, forever. Every network boot setup hits that loop once.

## The Failures I Actually Hit

**Nothing happens at all.** Check that the interface is actually in the right
VLAN and that DHCP snooping or a rogue server guard on the switch is not eating
the offer. Turn on `log-dhcp` and watch for the DISCOVER. If you never see it,
the problem is layer 2, not boot.

**Address assigned, no boot file.** The client got an offer from a different
DHCP server, one that knows nothing about booting. Two DHCP servers on one
broadcast domain is a race, and the loser is whichever one you configured.

**TFTP times out partway.** Almost always a firewall. TFTP starts on UDP 69 and
then moves to an ephemeral port for the transfer, which means stateless filter
rules that only allow port 69 break it after the first packet. Connection
tracking with the TFTP helper, or just moving to HTTP as early as possible,
solves it.

**Boots, then the installer cannot reach anything.** Spanning tree. The port
went into forwarding after the firmware gave up waiting. Portfast, or its
equivalent, on access ports fixes this and you should have it anyway.

Bisect by leg. Did DHCP happen, did the transfer happen, did the loader run.
Three questions, and each one has an obvious place to look.

## References

- [RFC 2131: Dynamic Host Configuration Protocol](https://www.rfc-editor.org/rfc/rfc2131.html)
- [RFC 2132: DHCP Options and BOOTP Vendor Extensions](https://www.rfc-editor.org/rfc/rfc2132.html)
- [RFC 4578: DHCP Options for PXE](https://www.rfc-editor.org/rfc/rfc4578.html)
- [RFC 1350: The TFTP Protocol (Revision 2)](https://www.rfc-editor.org/rfc/rfc1350.html)
- [iPXE documentation](https://ipxe.org/docs)
- [UEFI specifications](https://uefi.org/specifications)
