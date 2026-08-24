
## Issuance is a one time problem, renewal is forever

Nobody has an outage because they could not get a certificate. They have an
outage because a certificate they got eighteen months ago quietly reached its
notAfter date at three in the morning on a weekend, on a service that only
gets traffic from an internal client with certificate validation turned on and
no useful error message.

That shape repeats often enough to be a design principle: the interesting
part of certificate management is not issuance, it is the renewal loop, and
the renewal loop has five steps, not one. Request, install, reload the service
that holds the private key, verify from outside, and alert on time remaining.
Most automation covers the first two, the third silently no ops, and nobody
built the last two at all.

## You cannot rotate what you cannot list

Start with an inventory that is generated, not maintained. A file of host and
port pairs plus a loop beats a spreadsheet that is a year stale.

```bash
#!/usr/bin/env bash
# check-expiry.sh: days remaining for every endpoint in endpoints.txt
set -euo pipefail

THRESHOLD="${THRESHOLD:-21}"
now="$(date +%s)"
rc=0

while read -r endpoint; do
  case "$endpoint" in ''|'#'*) continue ;; esac
  host="${endpoint%%:*}"

  if ! enddate="$(echo | openssl s_client -servername "$host" -connect "$endpoint" 2>/dev/null | openssl x509 -noout -enddate)"; then
    echo "ERROR ${endpoint} could not complete a TLS handshake"
    rc=1
    continue
  fi

  expiry="$(date -d "${enddate#notAfter=}" +%s)"
  days=$(( (expiry - now) / 86400 ))
  echo "${endpoint} ${days} days"

  if [ "$days" -lt "$THRESHOLD" ]; then
    echo "WARN ${endpoint} expires in ${days} days"
    rc=1
  fi
done < endpoints.txt

exit "$rc"
```

Two details make this worth running. It uses SNI, so it checks the certificate
a real client would be served rather than the default virtual host. And it
checks over the network from outside the host, which catches the case where
renewal succeeded on disk and the service is still holding the old certificate
in memory. That case is the single most common one I have seen, and a check
that reads the file on disk will never find it.

Chain problems deserve their own check, because a missing intermediate works
in a browser that caches it and fails everywhere else:

```bash
openssl s_client -servername example.internal -connect example.internal:443 -showcerts < /dev/null
```

## Short lifetimes are a feature

The industry trend has been toward shorter certificate lifetimes for years,
and I think that is straightforwardly good even though it makes life harder in
the short run. A certificate valid for a year is a certificate whose renewal
path is exercised once a year, which means it is broken and you do not know
yet. A certificate valid for weeks forces the renewal path to be automatic,
tested continuously, and boring.

It also shrinks the window in which a stolen key is useful, which is the part
revocation was supposed to handle and mostly does not, since revocation
checking is inconsistently enforced and can fail open.

So I design as if lifetimes will keep shrinking: no manual steps, no human in
the renewal path, and no certificate whose replacement requires a change
request.

## The failure modes worth planning for

- **The reload that is not a reload.** Renewal writes a new file and the
  daemon keeps serving the old one from memory. Every deploy hook needs an
  actual reload, and every reload needs the external verification above.
- **The challenge that breaks silently.** An HTTP-01 challenge stops working
  the day someone adds a global redirect to HTTPS or a WAF rule in front of
  the well known path. DNS-01 avoids that and works for internal names, at the
  cost of API credentials. Narrow those credentials by delegating a challenge
  zone with a CNAME so the token can only write records in one place.
- **Clock skew.** Validation is a time comparison. A host whose clock is
  wrong rejects perfectly good certificates, and a freshly imaged machine with
  no time source is the classic case.
- **The root nobody scheduled.** Leaf certificates rotate weekly and the
  internal CA root sits there for a decade until it does not. Put the root and
  intermediate expiry in the same monitoring as everything else, and plan the
  cross signed overlap years before you need it.
- **Certificates baked into images.** A certificate copied into a container
  image at build time expires on the image's schedule, not the certificate's.
  Mount them, do not bake them.
- **Pinning.** Any client that pins a leaf or an intermediate turns your
  routine rotation into their outage. Pin to a root you control, or do not pin.

## Rotate keys, not just certificates

Renewal that reuses the same private key and CSR forever is rotation in name
only. If the key was exposed at any point, every renewal reissues a
certificate for the exposed key. Generate a fresh key per issuance. Most ACME
clients do this by default, and it is worth confirming rather than assuming.

The mirror image applies to internal PKI: an intermediate that signs everything
and lives on a general purpose server is a single point of compromise. Keep the
root offline, keep the intermediate's issuance scope narrow, and log every
issuance somewhere the issuing host cannot rewrite. For public certificates,
Certificate Transparency gives you that log for free, and monitoring CT for
your own domains is a cheap way to find out about a certificate you did not
request.

## References

- [RFC 8555: Automatic Certificate Management Environment (ACME)](https://www.rfc-editor.org/rfc/rfc8555)
- [RFC 5280: Internet X.509 Public Key Infrastructure Certificate and CRL Profile](https://www.rfc-editor.org/rfc/rfc5280)
- [RFC 6962: Certificate Transparency](https://www.rfc-editor.org/rfc/rfc6962)
- [NIST NCCoE: TLS Server Certificate Management](https://www.nccoe.nist.gov/projects/tls-server-certificate-management)
- [Certbot documentation](https://eff-certbot.readthedocs.io/)
