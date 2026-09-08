/**
 * Six paths, and only one of them behaves the way the textbook says.
 *
 * Each is a shape somebody actually builds: a tunnel that takes bytes off
 * the top, a provider link that is not 1500, a firewall configured by
 * somebody who blocked ICMP wholesale, jumbo frames enabled on three
 * switches out of four. The point of having six rather than one is that the
 * symptom is identical across all of them and the fix is not.
 */

import type { Path } from "../types";

export const PATHS: Path[] = [
  {
    slug: "clean",
    name: "Ethernet all the way",
    senderMtu: 1500,
    hops: [
      { name: "gw.office", mtu: 1500 },
      { name: "core1", mtu: 1500 },
      { name: "isp-edge", mtu: 1500 },
      { name: "dc-edge", mtu: 1500 },
      { name: "app.example.com", mtu: 1500 },
    ],
  },
  {
    slug: "pppoe",
    name: "A PPPoE line, which is not 1500",
    senderMtu: 1500,
    hops: [
      { name: "gw.office", mtu: 1500 },
      { name: "bras.isp", mtu: 1492, note: "PPPoE takes 8 bytes: 6 of PPPoE header and 2 of PPP" },
      { name: "isp-core", mtu: 1500 },
      { name: "app.example.com", mtu: 1500 },
    ],
  },
  {
    slug: "vpn-honest",
    name: "An IPsec tunnel that reports itself",
    senderMtu: 1500,
    hops: [
      { name: "gw.office", mtu: 1500 },
      { name: "vpn-a", mtu: 1438, note: "ESP with SHA-256 and AES-CBC costs about 62 bytes" },
      { name: "vpn-b", mtu: 1500 },
      { name: "app.internal", mtu: 1500 },
    ],
  },
  {
    slug: "blackhole",
    name: "The same tunnel, behind a firewall that drops ICMP",
    senderMtu: 1500,
    hops: [
      { name: "gw.office", mtu: 1500 },
      { name: "fw.office", mtu: 1500, blocksIcmp: true, note: "Deny all ICMP inbound, added in 2019 and never revisited" },
      { name: "vpn-a", mtu: 1438, note: "ESP with SHA-256 and AES-CBC costs about 62 bytes" },
      { name: "vpn-b", mtu: 1500 },
      { name: "app.internal", mtu: 1500 },
    ],
  },
  {
    slug: "half-jumbo",
    name: "Jumbo frames on three switches out of four",
    senderMtu: 9000,
    hops: [
      { name: "tor-a", mtu: 9000 },
      { name: "spine-1", mtu: 9000 },
      { name: "tor-b", mtu: 1500, note: "Never had its MTU raised, and nobody noticed for a year" },
      { name: "st02.storage", mtu: 9000 },
    ],
  },
  {
    /*
      Two firewalls block ICMP and only one of them is responsible.

      The tunnel that drops the packet terminates inside the data centre, so
      the ICMP it generates meets fw.dc first and dies there. fw.branch also
      blocks ICMP and is completely irrelevant to this symptom: it is behind
      the message on the return path and never sees it. Blaming it, which is
      what reading the topology left to right invites, sends somebody to
      change a firewall that would not have helped.
    */
    slug: "double-block",
    name: "Two firewalls block ICMP and one of them matters",
    senderMtu: 1500,
    hops: [
      { name: "gw.branch", mtu: 1500 },
      { name: "fw.branch", mtu: 1500, blocksIcmp: true, note: "Denies all ICMP in both directions, added in 2019" },
      { name: "carrier", mtu: 1500 },
      { name: "fw.dc", mtu: 1500, blocksIcmp: true, note: "The other end, same policy" },
      { name: "tun0", mtu: 1400, note: "GRE over IPsec, terminating inside the data centre" },
      { name: "app.dc", mtu: 1500 },
    ],
  },
];

export const pathFor = (slug: string) => PATHS.find((path) => path.slug === slug);
