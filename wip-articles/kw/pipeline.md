# Article pipeline tracker (100 articles)

Status keys: research | drafting | review | in-PR #n | merged

## Batch 1: Mac Pro 7,1 (PR #252)
- linux-on-mac-pro-7-1 | "mac pro 7 1 linux" | research (agent)
- windows-11-on-mac-pro-7-1 | "mac pro 7 1 windows 11" | research (agent)
- macos-tahoe-on-mac-pro-7-1 | "mac pro 7 1 tahoe" | research (agent)
- mac-pro-5-1-vs-7-1 | "mac pro 5 1 vs 7 1" | research (agent)

## Batch 2: Apple server history
- apple-server-hardware | "apple server hardware" | WRITTEN (drafts/apple-server-hardware.md), images in repo tree uncommitted
- macos-server-versions | "macos server versions" | WRITTEN (drafts), chart cover in repo tree uncommitted

## Batch 3: FortiGate
- fortigate-homelab-license | DRAFTED (40 refs, 110 claims, "FortiGate Homelab License: What Works Without a Contract") - review + integrate in FortiGate batch
- fortigate-60e-to-60f-migration | DRAFTED (46 refs, 121 claims, "FortiGate 60E to 60F Migration: Three Paths and What Breaks") - review; verify lifecycle dates (EoO Dec 29 2021, EoS Dec 29 2026) in browser-equivalent; 5 claims rest on search snippets

## Batch 4: Dell 13th gen
- dell-r730-vs-r730xd | DRAFTED (27 refs, 116 claims, title "Dell PowerEdge R730 vs R730xd: Every Bay, Slot and GPU Limit") - review + integrate in Dell batch; cross-link with quiet fans
- dell-r730-quiet-fans | DRAFTED (28 refs, 116 claims) - review + integrate in Dell batch; cover idea File:Dell PowerEdge R720xd (1).jpg (already used elsewhere) or chart

## Candidate gaps not yet assigned
- mac pro 7 1 gpu; mac pro 7 1 cpu upgrade; idrac 6 virtual console; perc h730 zfs; xserve linux; fortigate 60f is it a router

## Batch 5: Vintage Mac Pro (drafting agents launched)
- mac-pro-5-1-latest-os | "mac pro 5 1 latest os" [27] | drafting
- mac-pro-4-1-vs-5-1 | "mac pro 4 1 vs 5 1" [27] | drafting
- mac-pro-4-1-to-5-1-firmware-upgrade | CLOSED (jensd.be exact-title guide ranks); skip
- mac-pro-6-1-latest-os | "mac pro 6 1 latest os" [27] | drafting

## QUEUE (from kw/cands2.txt; demand in brackets). Pick themed groups of 4-6.
Vintage/modern Apple: mac pro 4 1 latest os + mac pro 2009 latest os[21] | mac pro 5 1 max ram[18] | mac pro 6 1 linux[21] | mac pro 2010 vs 2012[12] | mac pro 2012 vs 2013[10] | mac pro 2019 vs mac studio[10] | mac pro 2023 vs 2019[10] | imac pro tahoe[10] | opencore legacy patcher tahoe[27] | mac pro 7 1 gpu[10] | mac pro 7 1 cpu upgrade[18] | mac pro 7 1 power supply[10] | mac pro 2013 vs mac mini m4[10] | why did the power mac g4 cube fail[10] | power mac g5 linux[10] | xserve linux[10] | mpx module mac pro[24] | t2 chip windows 11[10]
Dell storage: dell hba330 vs h330[10] | perc h755 vs h355[18] | perc h740p it mode/zfs[10] | perc h730 zfs[10] | dell boss card (s1 s2 n1)[27] | truenas on dell r720[24] | truenas on dell r730[18]
iDRAC: idrac fan speed offset[30] | idrac fan control docker[15] | idrac 10 vs 9 / core vs enterprise[21] | idrac 6 virtual console[18] | idrac 8 html5 console[10]
Dell comparisons: poweredge r540 vs r740 | dell r330 vs r430 | poweredge r430 vs r630 | dell r340 vs r440 | dell t630 vs t640 | dell t640 vs t440 | dell r820 vs r720 | poweredge r760 vs r770 (all [10])
HBAs/JBOD: lsi 9207-8i vs 9211-8i[18] | sas expander vs hba[18] | netapp ds4243 vs ds4246[10] | netapp ds4246 truenas[10] | lsi 9300-8i fan[21]
FortiGate: fortigate 40f vs 60f[10] | fortios 7.6 vs 7.4[10] | does fortigate 70g support ssl vpn[10] | fortigate 30e vs 30g[10] | fortigate 60f is it a router[10] | fortigate 40f wifi[10] | pfsense/opnsense on fortigate[10]
Cisco: catalyst 9200 vs 9300[10] | catalyst 3750 layer 3 + nat[10] | cisco 1941 vs 2911[10] | cisco 2960 jumbo frames[10]
HPE/Supermicro/Lenovo: ilo 5 vs ilo 6[10] | smart array p420i hba mode[10] | smart array p440ar proxmox[10] | supermicro x10 vs x11[10] | supermicro x11 nvme boot[10] | proliant dl360p gen8 fan[24] | microserver gen10 plus vs v2[10] | lenovo sr650 vs dell r740[10]
Firewalls: sophos xg home vs opnsense[12]

## Site accuracy follow-up (separate PR)
- Mac Pro discontinued March 26, 2026: update existing posts that call it current (xserve-apple-server-legacy "the Mac Pro is your only option", mac-pro-rack-mount-homelab, others; grep "Mac Pro").
- dell-poweredge-r740-deep-dive says third-party PCIe cooling response is "exposed through iDRAC and IPMI"; Dell's iDRAC9 paper says no customer-facing IPMI support and the setting is per PCIe slot (from R730 quiet fans agent). Fix in accuracy PR.
- fortigate-firewall-homelab groups application control with paid FortiGuard; Fortinet docs say app control signatures come with FortiCare (from license agent). Verify + align in accuracy PR.
