
## DNS Is Everything

If DNS is not working, nothing works. Web browsers cannot resolve domain names. Active Directory cannot find domain controllers. Email cannot route to mail servers. Monitoring systems cannot identify hosts. DNS is the foundation that everything else depends on, and it is the single most common cause of "the network is down" complaints.

## How DNS Works

DNS translates human-readable domain names into IP addresses. When you type a URL into a browser, your computer asks a DNS resolver for the IP address. The resolver checks its cache, and if it does not have the answer, it queries authoritative DNS servers in a hierarchical process that starts at the root servers and works down through the domain hierarchy.

Concretely, resolving `www.example.com` from a cold cache is three questions, not one. The resolver asks a root server, which does not know the answer but returns a referral to the `.com` nameservers. It asks a `.com` nameserver, which returns a referral to the nameservers for `example.com`. It asks one of those, which is authoritative and returns the actual A record. Each step is a full query and response, which is why the first lookup of a name is slow and every lookup after it is instant.

There are 13 root server identities, `a.root-servers.net` through `m.root-servers.net`. That number is not because there are 13 machines. It is because the original priming response had to fit in a 512 byte UDP DNS message, which is the limit set in RFC 1035. Each of those 13 identities is anchored by anycast to hundreds of physical instances worldwide.

That 512 byte limit is still the default. EDNS(0), defined in RFC 6891, is the mechanism that lets a resolver advertise it can receive larger UDP responses, and current practice is to advertise 1232 bytes to stay under common IPv6 fragmentation thresholds. When a response still does not fit, the server sets the truncated bit and the client retries over TCP. This is why blocking TCP port 53 on a firewall is a mistake. DNS over TCP is a required part of the protocol, not a legacy fallback, and blocking it produces failures that only appear for large responses, which means DNSSEC-signed zones and anything with many records.

## Records, TTLs, and the SOA

A zone is made of resource records. The ones you actually touch: A for IPv4, AAAA for IPv6, CNAME for an alias, MX for mail routing, TXT for verification and policy data, SRV for service discovery, PTR for reverse lookups, NS to delegate, and SOA at the top of every zone.

The SOA record is where the operational behavior of a zone is defined, and its fields are easy to skim past:

- **Serial.** A version number. Secondaries only pull a new copy of the zone when this number increases.
- **Refresh.** How often a secondary checks the primary's serial.
- **Retry.** How long a secondary waits after a failed check.
- **Expire.** How long a secondary keeps serving the zone when it cannot reach the primary at all. Once this elapses the secondary stops answering, which is a hard outage.
- **Minimum.** Originally a default TTL. RFC 2308 redefined it as the negative caching TTL, the time a resolver may cache an NXDOMAIN answer for this zone, capped by the SOA record's own TTL and recommended to be no more than 3 hours.

Two TTL details that catch people out. First, RFC 2181 is clear that TTL belongs to the RRset, not to individual records. Every A record for the same name must share a TTL, and a server that is handed different ones is entitled to pick. Second, negative answers are cached too. If you query a name before you create it, the NXDOMAIN sticks around for the negative TTL and the record you just added appears to not exist. That is not a propagation delay, it is your own resolver holding a "no" it was told to remember.

## My DNS Setup

I run two BIND DNS servers in my lab on separate VMs for redundancy. They serve as authoritative servers for my internal domain and as recursive resolvers for external queries.

Internal DNS means I can access my servers by name instead of IP address. Instead of remembering that the Proxmox host is at 10.0.20.5, I type pve01.lab.local. When I reconfigure IP addresses, I update DNS once instead of updating every configuration file that references the old IP.

### The mistake in that setup, stated plainly

`.local` is the wrong choice, and it is the single most common naming error in homelabs. RFC 6762 reserves `.local` for Multicast DNS. On macOS, on Linux running Avahi or systemd-resolved, and on other mDNS-aware clients, a query for a `.local` name is sent to the multicast group 224.0.0.251 instead of to your unicast DNS server. The result is resolution that works on some machines and not others, works from the shell and not from an application, and changes behavior after an OS update. It is one of the most frustrating classes of DNS bug precisely because the server is configured correctly.

Use a subdomain of a domain you actually own, like `lab.example.com`, or use `home.arpa`, which RFC 8375 designates for exactly this purpose. Owning the parent domain also means you can get real TLS certificates for internal names later, which you cannot do for `.local` or for a made-up TLD.

### Two servers is not automatic failover

Listing two nameservers does not give you graceful failover, and this surprises everyone. The stub resolver on Linux reads `/etc/resolv.conf`, tries the servers in order, and by default waits 5 seconds for a timeout and makes 2 attempts across the list. Only the first 3 `nameserver` lines are used at all. If your primary is down but still reachable enough to drop packets silently, every single lookup stalls for seconds before falling through to the secondary. The machine is not down. It just feels broken.

```
# /etc/resolv.conf: fail over faster instead of waiting 5 seconds
nameserver 10.0.20.10
nameserver 10.0.20.11
options timeout:1 attempts:2 rotate
```

`rotate` spreads queries across the listed servers instead of hammering the first one. On systems using systemd-resolved or NetworkManager, edit the source of truth rather than `/etc/resolv.conf` directly, because it is a generated file and your changes will vanish.

## Split DNS

I use split DNS (also called split-horizon DNS) so internal queries resolve to internal addresses and external queries resolve normally. My FortiGate handles this by directing DNS queries from internal VLANs to my internal DNS servers, while guest VLAN queries go directly to public DNS.

Split DNS has a specific set of ways it goes wrong. The classic one is a name that exists internally and not externally, so the service works from inside and produces NXDOMAIN from a phone on cellular. The second is a certificate mismatch, where the internal address is reached over a name that the certificate does not cover. The third, and the modern one, is DNS over HTTPS. Browsers can be configured to send DNS queries to a public resolver over HTTPS, entirely bypassing the resolver your DHCP handed out. The symptom is unmistakable once you know it: `dig` resolves the internal name fine, and the browser on the same machine cannot reach it. Check the browser's secure DNS setting before you touch the server.

## Do Not Leave Recursion Open

If your recursive resolver answers queries from any source address, it is an open resolver, and open resolvers get used as amplifiers in reflection attacks. An attacker spoofs a victim's source address, sends a small query, and your server sends a much larger answer to the victim. In BIND the control is `allow-recursion`, and it should list your internal networks only.

```
options {
    recursion yes;
    allow-recursion { 10.0.0.0/8; localhost; };
    allow-query-cache { 10.0.0.0/8; localhost; };
};
```

Authoritative-only servers should have `recursion no`. Separating the authoritative and recursive roles onto different servers is the cleaner design and worth doing if you have the VMs to spare.

## Common Problems

The most common DNS issue I troubleshoot is stale records. If a server gets a new IP but the DNS record still points to the old one, connections fail in confusing ways. I handle this with short TTLs (time to live) on internal records, so changes propagate quickly.

Short TTLs are a real tradeoff, not a free win. A 300 second TTL means resolvers re-query 12 times an hour per name instead of once a day, which multiplies query load and makes every client more dependent on the resolver being up. The professional pattern is to lower the TTL a day before a planned change, make the change, confirm it, then raise the TTL back.

**The serial number you forgot to bump.** This is the classic BIND failure. You edit the zone file, reload, and the primary serves the new record correctly. The secondary never updates, because it compares serials and yours did not increase. The symptom is a record that resolves from one nameserver and not the other, which looks like corruption and is not. Use the `YYYYMMDDNN` convention and let `named-checkzone` catch the mistake before a reload does not.

```bash
# Validate config and zone before reloading. Catches the serial and syntax errors.
named-checkconf
named-checkzone lab.example.com /var/named/lab.example.com.zone
rndc reload lab.example.com

# Compare serials between primary and secondary. They should match.
dig @10.0.20.10 lab.example.com SOA +short
dig @10.0.20.11 lab.example.com SOA +short
```

The second most common issue is DNS forwarding misconfiguration. If your internal DNS server cannot resolve external domains because the forwarder is misconfigured, your servers cannot reach the internet for updates, NTP, or anything else.

**Forwarding loops.** If server A forwards to server B and B forwards back to A, queries bounce until they time out. The symptom is that internal names resolve instantly and external names take 5 seconds and then fail. Check that your forwarders point outward, at a real upstream resolver, and that the upstream is not your own firewall's DNS proxy pointing back at you.

## Testing DNS

I test DNS configurations with `dig` and `nslookup`. Both tools query DNS servers and show the response, including which server answered, the TTL, and the record type.

```bash
dig @10.0.20.10 pve01.lab.local
nslookup pve01.lab.local 10.0.20.10
```

Always test from the perspective of the client that is having the problem. DNS issues are often specific to which resolver a client is using.

A few flags worth having in your fingers:

```bash
# Walk the delegation from the root yourself. Shows exactly where it breaks.
dig +trace www.example.com

# Ask an authoritative server directly, no recursion. If this works and the
# recursive path does not, the problem is the resolver, not the zone.
dig @ns1.example.com www.example.com +norecurse

# Watch a TTL count down on repeat queries. If it does, you are hitting cache.
dig www.example.com | grep -A1 'ANSWER SECTION'

# Which resolver is this client actually using right now
resolvectl status
```

The TTL trick is the fastest way to answer "is this cached or fresh". Query twice a few seconds apart. If the TTL in the answer decreased, you are reading a cached record, and the age of the answer is the original TTL minus what is left.

## References

- https://www.rfc-editor.org/rfc/rfc1034
- https://www.rfc-editor.org/rfc/rfc2181
- https://www.rfc-editor.org/rfc/rfc2308
- https://www.rfc-editor.org/rfc/rfc6762
- https://bind9.readthedocs.io/en/latest/
- https://man7.org/linux/man-pages/man5/resolv.conf.5.html
