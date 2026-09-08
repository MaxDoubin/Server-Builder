/**
 * A small internet, with eight things wrong with it.
 *
 * Every domain here is under a reserved name or one of the documentation
 * ranges, so nothing resolves anywhere real and nobody copies an address out
 * of this page into a config file that then works by accident.
 *
 * The faults are chosen for one property: from the client side, most of them
 * produce the same symptom. "It does not resolve" covers a lame delegation, a
 * missing glue record, a nameserver whose own name does not resolve, and a
 * CNAME to a name that does not exist, and telling them apart is the whole
 * skill.
 */

import type { World } from "../types";

const a = (name: string, value: string, ttl = 3600) =>
  ({ name, type: "A" as const, ttl, value });
const ns = (name: string, value: string, ttl = 172800) =>
  ({ name, type: "NS" as const, ttl, value });
const cname = (name: string, value: string, ttl = 300) =>
  ({ name, type: "CNAME" as const, ttl, value });
const mx = (name: string, value: string, ttl = 3600) =>
  ({ name, type: "MX" as const, ttl, value });
const txt = (name: string, value: string, ttl = 300) =>
  ({ name, type: "TXT" as const, ttl, value });

export const WORLD: World = {
  hosts: {
    "a.root-servers.net": "198.41.0.4",
    "b.root-servers.net": "199.9.14.201",
    "a.gtld-servers.example": "192.0.2.30",
    "b.gtld-servers.example": "192.0.2.31",
    "ns1.northbay.example": "203.0.113.10",
    "ns2.northbay.example": "203.0.113.11",
    "ns1.orionsupply.example": "203.0.113.20",
    "ns2.orionsupply.example": "203.0.113.21",
    // ns1.depot-dns.example is deliberately absent: depot.example is delegated
    // to a host that has no address anywhere, which is a delegation to nothing.
    "ns1.hartline.example": "203.0.113.30",
    "ns1.retired-dns.example": "203.0.113.40",
    "ns1.quarry.example": "198.51.100.50",
    "ns2.quarry.example": "198.51.100.51",
    "ns1.cdn-edge.example": "198.51.100.60",
  },
  /*
    Glue held at each parent.

    Only in-bailiwick servers appear here, because glue for anything else is
    not glue. A record for ns1.cdn-edge.example in the example zone is a record
    about a name that zone does not serve, and a resolver discards it: the
    address has to come from a real lookup of cdn-edge.example instead. Adding
    it here would model a thing that does not happen.

    Note what is missing from the in-bailiwick set: quarry.example, whose
    nameservers are inside quarry.example and which therefore cannot be found.
  */
  glue: {
    "": ["a.gtld-servers.example", "b.gtld-servers.example"],
    example: [
      "ns1.northbay.example",
      "ns2.northbay.example",
      "ns1.orionsupply.example",
      "ns2.orionsupply.example",
      "ns1.hartline.example",
    ],
  },
  zones: [
    {
      origin: "",
      servers: ["a.root-servers.net", "b.root-servers.net"],
      loaded: true,
      records: [ns("example", "a.gtld-servers.example"), ns("example", "b.gtld-servers.example")],
    },
    {
      origin: "example",
      servers: ["a.gtld-servers.example", "b.gtld-servers.example"],
      loaded: true,
      records: [
        ns("northbay.example", "ns1.northbay.example"),
        ns("northbay.example", "ns2.northbay.example"),
        ns("orionsupply.example", "ns1.orionsupply.example"),
        ns("hartline.example", "ns1.hartline.example"),
        ns("quarry.example", "ns1.quarry.example"),
        ns("quarry.example", "ns2.quarry.example"),
        ns("archive.example", "ns1.retired-dns.example"),
        ns("depot.example", "ns1.depot-dns.example"),
        ns("cdn.example", "ns1.cdn-edge.example"),
      ],
    },
    {
      origin: "northbay.example",
      servers: ["ns1.northbay.example", "ns2.northbay.example"],
      loaded: true,
      records: [
        a("northbay.example", "203.0.113.100"),
        a("www.northbay.example", "203.0.113.100"),
        cname("portal.northbay.example", "portal.cdn.example"),
        cname("old.northbay.example", "archive.example"),
        cname("mail.northbay.example", "mail.gone.example"),
        a("dev.northbay.example", "203.0.113.101"),
        mx("northbay.example", "10 mx1.northbay.example"),
        a("mx1.northbay.example", "203.0.113.102"),
        txt("_dmarc.northbay.example", "v=DMARC1; p=quarantine; rua=mailto:d@northbay.example"),
        a("ns1.northbay.example", "203.0.113.10"),
        a("ns2.northbay.example", "203.0.113.11"),
      ],
    },
    {
      // Two servers, one of which is fine. A control: redundancy working.
      origin: "orionsupply.example",
      servers: ["ns1.orionsupply.example", "ns2.orionsupply.example"],
      loaded: true,
      records: [
        a("orionsupply.example", "203.0.113.200"),
        a("www.orionsupply.example", "203.0.113.200"),
        a("ns1.orionsupply.example", "203.0.113.20"),
        a("ns2.orionsupply.example", "203.0.113.21"),
      ],
    },
    {
      origin: "hartline.example",
      servers: ["ns1.hartline.example"],
      loaded: true,
      records: [
        a("hartline.example", "203.0.113.150"),
        mx("hartline.example", "10 mail.hartline.example"),
        a("mail.hartline.example", "203.0.113.151"),
        a("ns1.hartline.example", "203.0.113.30"),
      ],
    },
    {
      // Delegated to servers inside itself, with no glue at the parent.
      origin: "quarry.example",
      servers: ["ns1.quarry.example", "ns2.quarry.example"],
      loaded: true,
      records: [
        a("quarry.example", "198.51.100.5"),
        a("www.quarry.example", "198.51.100.5"),
        a("ns1.quarry.example", "198.51.100.50"),
        a("ns2.quarry.example", "198.51.100.51"),
      ],
    },
    {
      // Delegated to a host with no address anywhere.
      origin: "depot.example",
      servers: ["ns1.depot-dns.example"],
      loaded: true,
      records: [a("depot.example", "203.0.113.240")],
    },
    {
      // Delegated to a server that no longer holds it.
      origin: "archive.example",
      servers: ["ns1.retired-dns.example"],
      loaded: false,
      records: [a("archive.example", "203.0.113.250")],
    },
    {
      origin: "cdn.example",
      servers: ["ns1.cdn-edge.example"],
      loaded: true,
      records: [
        a("cdn.example", "198.51.100.7"),
        cname("portal.cdn.example", "edge-42.cdn.example"),
        a("edge-42.cdn.example", "198.51.100.8"),
        cname("ring.cdn.example", "ring-b.cdn.example"),
        cname("ring-b.cdn.example", "ring.cdn.example"),
        a("ns1.cdn-edge.example", "198.51.100.60"),
      ],
    },
  ],
};
