
## What encrypted DNS actually changes

For most of the history of the internet, the answer to "which resolver does
this machine use" came from the network. DHCP handed out option 6, the stub
resolver wrote it into `/etc/resolv.conf`, and every application on the box
asked that server. If you ran the network, you ran name resolution, and
everything downstream of that assumption worked.

Encrypted DNS does not change the protocol very much. It changes who picks the
resolver. DNS over HTTPS is a normal DNS query in a normal HTTPS request, and
an application that speaks HTTPS already has everything it needs to resolve
names without asking you. That is the part that lands on your desk.

## The two protocols, briefly

DNS over TLS (RFC 7858) is ordinary DNS wire format inside a TLS session on
TCP port 853. It has its own port, so it is visible on the network and
trivially blockable. DNS over HTTPS (RFC 8484) puts the same wire format in an
HTTP request body or in a base64url query parameter on port 443, mixed in with
every other web request on the machine. There is also DNS over QUIC on 853
(RFC 9250), which behaves like DoT for your purposes.

Both are easy to speak from a shell, which is the fastest way to prove a path
works before you trust a client with it:

```bash
# DoT, with the certificate actually validated
kdig -d @1.1.1.1 +tls-ca +tls-host=cloudflare-dns.com \
  example.com A

# DoH, RFC 8484 wire format, GET with the query in base64url
curl -sS -H 'accept: application/dns-message' \
  'https://cloudflare-dns.com/dns-query?dns=AAABAAABAAAAAAAAA3d3dwdleGFtcGxlA2NvbQAAAQAB' \
  | od -A x -t x1z | head -4
```

Neither protocol says anything about whether the answer is true. They
authenticate the resolver and hide the query from the path. That is a
different job from [DNSSEC](/blog/dns-security-dnssec), which signs the data
so it survives an untrustworthy carrier. The two solve opposite halves and you
want both.

## Why it breaks the names you own

Split-horizon DNS depends on clients asking your resolver. Internal zones
resolve to internal addresses, the same names either do not exist outside or
point somewhere public, and the whole arrangement rests on one rule: queries
for `lab.example` go to `10.20.0.5`.

A browser with secure DNS enabled sends every query to a public resolver over
443. That resolver has never heard of `nas.lab.example`, so it returns
NXDOMAIN, and the browser reports that the site cannot be found. Meanwhile
`dig` on the same laptop, using the stub resolver and your DHCP-supplied
server, answers correctly in five milliseconds.

That split is the signature of the whole class of problem:

```bash
# Works: uses /etc/resolv.conf, which points at your resolver
dig +short nas.lab.example
10.20.30.14

# Also works: asks the internal server directly
dig @10.20.0.5 +short nas.lab.example
10.20.30.14

# Browser says the name does not exist
```

When resolution succeeds from the command line and fails in one application,
stop looking at the DNS server. The application is not using it.

The same mechanism quietly removes three other things you may be relying on:
DNS-based filtering, query logging, and any policy that depends on seeing
which names a device asked for. None of them fail loudly. They just stop
covering the clients that upgraded themselves.

## Getting the network back into the decision

There are four workable levers and one that only looks like one.

**Answer the canary.** Firefox queries `use-application-dns.net` at startup
and disables its own DoH if the network answers NXDOMAIN. In Unbound that is
one line:

```text
server:
    local-zone: "use-application-dns.net" always_nxdomain
```

It is a convention Mozilla honours, not a standard, and nothing else is
obliged to check it. It is still the cheapest thing on this list.

**Set policy where the client is managed.** Every major browser exposes secure
DNS as an enterprise policy, and the right setting is usually not "off" but
"use this specific template", pointed at a resolver you run. A managed client
should be told what to do, not left to guess and then be blocked.

**Advertise an encrypted resolver properly.** This is what RFC 9462 and RFC
9463 exist for. DDR lets a client that already knows your resolver's IP
discover its encrypted endpoints by querying SVCB records under
`_dns.resolver.arpa`, and DNR carries the same designation in a DHCP option or
a router advertisement. Support is uneven, but it is the standards-track
answer, and it is the one that scales past a home network.

**Force plain DNS back to your server.** Redirect outbound 53 and reject 853
at the edge, which catches hardcoded devices and DoT clients:

```text
table ip nat {
  chain prerouting {
    type nat hook prerouting priority dstnat; policy accept;
    iifname "lan0" udp dport 53 ip daddr != 10.20.0.5 dnat to 10.20.0.5
    iifname "lan0" tcp dport 53 ip daddr != 10.20.0.5 dnat to 10.20.0.5
  }
}

table inet filter {
  chain forward {
    type filter hook forward priority filter; policy accept;
    iifname "lan0" tcp dport 853 counter reject
  }
}
```

And the lever that is not one: blocking DoH by port. It is 443 to a host that
also serves web pages. You are left with blocklists of known DoH endpoint
names and addresses, which are maintained by third parties, go stale, and lose
to any resolver that is not on the list. Treat them as reducing the noise, not
as a control.

## Encrypt your own last hop

The privacy argument for encrypted DNS is real, and the honest response is not
to fight it but to offer it. Run the resolver, then let clients reach it over
TLS so nobody has a reason to reach past you.

On a systemd host, that is a drop-in:

```ini
# /etc/systemd/resolved.conf.d/lab.conf
[Resolve]
DNS=10.20.0.5#dns.lab.example
DNSOverTLS=yes
Domains=~lab.example
Cache=yes
```

```bash
sudo systemctl restart systemd-resolved
resolvectl status | head -20
resolvectl query nas.lab.example
```

The `#dns.lab.example` suffix is the name the certificate must present, and it
is the difference between a real check and a warm feeling. RFC 8310 names the
two postures: opportunistic privacy encrypts when it can and falls back to
plaintext when it cannot, which protects you from passive observation and not
from anyone able to interfere; strict privacy validates the resolver and fails
closed. `DNSOverTLS=yes` is strict, `opportunistic` is the other one. If you
choose strict, know that a broken resolver now means no name resolution at
all, and put that in the runbook.

## What I run

Internal resolver on the wired network with the internal zones and full query
logging, DoT enabled on it, upstream forwarding over DoT to two providers,
the canary zone answered NXDOMAIN, browser policy pushed on the managed
laptops, port 53 redirected and 853 rejected for everything else. Guest
devices get the same resolver and no internal zones.

The unmanaged devices still win sometimes, and that is the accurate picture:
this is not a control you enforce, it is a default you make good enough that
nothing has a reason to route around it. What changed for me was diagnosis
time. Once "dig works, the browser does not" is a shape you recognise, it is a
ninety second call instead of an evening spent restarting a DNS server that
was answering correctly the entire time.

## References

- [RFC 8484: DNS Queries over HTTPS (DoH)](https://www.rfc-editor.org/rfc/rfc8484.html)
- [RFC 7858: Specification for DNS over Transport Layer Security](https://www.rfc-editor.org/rfc/rfc7858.html)
- [RFC 8310: Usage Profiles for DNS over TLS and DNS over DTLS](https://www.rfc-editor.org/rfc/rfc8310.html)
- [RFC 9462: Discovery of Designated Resolvers](https://www.rfc-editor.org/rfc/rfc9462.html)
- [RFC 9463: DHCP and Router Advertisement Options for DNR](https://www.rfc-editor.org/rfc/rfc9463.html)
- [resolved.conf(5)](https://man.archlinux.org/man/resolved.conf.5)
- [Mozilla: the canary domain use-application-dns.net](https://support.mozilla.org/en-US/kb/canary-domain-use-application-dnsnet)
