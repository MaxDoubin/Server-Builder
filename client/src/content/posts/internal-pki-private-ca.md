
## The self signed trap

Everyone starts the same way. A service needs TLS, you generate a self signed certificate, you click through the browser warning, and you move on. Then you have twenty services, twenty warnings, and you have trained yourself to ignore certificate errors, which is the exact instinct that gets people compromised.

An internal certificate authority fixes this properly. You install one root certificate on your machines, every internal service gets a certificate that chains to it, and warnings mean something again.

The catch is that a CA is a long lived piece of infrastructure with a key that can impersonate every service you own. Set it up carelessly and you will either rebuild it in a year or hand an attacker something very useful.

## Two tiers, and why

Do not issue certificates directly from your root.

The root's job is to sign one thing: an intermediate CA certificate. Then the root key goes offline, encrypted, on media that is not attached to a running machine, ideally with a copy somewhere physically separate. The intermediate does the day to day issuing.

The reason is recovery. If the issuing key is compromised, you revoke the intermediate, bring the root out, sign a new intermediate, and reissue. Painful but survivable, and the root certificate distributed to every client stays valid. If the root key itself is compromised, you have to reinstall trust on every device you own, which in practice means the CA is finished.

Give the root a long life, ten to twenty years, since replacing it means touching every client. Give the intermediate something much shorter, a few years, since rotating it is comparatively cheap.

```bash
# root, kept offline afterwards
openssl req -x509 -newkey ec -pkeyopt ec_paramgen_curve:P-256 \
  -keyout root.key -out root.crt -days 7300 -subj "/CN=Lab Root CA"

# intermediate CSR, signed by the root
openssl req -newkey ec -pkeyopt ec_paramgen_curve:P-256 \
  -keyout inter.key -out inter.csr -subj "/CN=Lab Issuing CA 1"
```

## Naming and SANs, decided up front

Get this right before you issue anything, because changing it means reissuing everything.

Modern clients ignore the common name entirely and validate against the subject alternative name extension. A certificate without a SAN will be rejected no matter how correct the CN looks. Every certificate needs SAN entries for every name and address clients will actually use.

Use real DNS names from a domain you control, including internally. Reserve a subdomain for internal use. Do not invent a fake top level domain, because the collision risk is real and some resolvers and browsers treat unknown suffixes strangely.

Include IP addresses in the SAN only when something genuinely connects by address, and prefer fixing the client to use a name.

```ini
# csr.cnf
[req]
distinguished_name = dn
req_extensions     = ext
prompt             = no

[dn]
CN = metrics.lab.example.net

[ext]
subjectAltName = @alt
keyUsage = critical, digitalSignature, keyEncipherment
extendedKeyUsage = serverAuth

[alt]
DNS.1 = metrics.lab.example.net
DNS.2 = metrics
IP.1  = 10.20.5.14
```

```bash
openssl req -new -newkey ec -pkeyopt ec_paramgen_curve:P-256 \
  -nodes -keyout metrics.key -out metrics.csr -config csr.cnf
```

## Short lifetimes beat revocation

Revocation on internal networks barely works. Certificate revocation lists need to be published, fetched, and honoured, and clients are inconsistent about all three. OCSP needs a responder that is reachable and available, which is another service to run and another thing to break.

The practical alternative is short lived certificates issued automatically. If a leaf certificate lives for weeks rather than years, a compromised key expires on its own before revocation would have propagated anyway.

That only works if issuance is automated, which is the real argument for running ACME internally instead of signing CSRs by hand. Set up an ACME capable CA, point your services at it, and renewal becomes something that happens without you. Manual issuance always ends in an expired certificate on a Sunday.

## Distributing trust

The root certificate has to land in every trust store that matters, and there are more of them than you expect: the OS store, the browser store on some platforms, Java's own store, Python's certifi bundle, Node's bundle, and every container image you build.

```bash
sudo cp root.crt /usr/local/share/ca-certificates/lab-root.crt
sudo update-ca-certificates
```

Push it with configuration management rather than by hand, and add it to your base container images. Distribute the root only, never the intermediate alone, and never the private key of either.

## Rules I hold to

The root key stays offline and encrypted, with a tested recovery copy. Leaf certificates are short lived and issued automatically. Every certificate has correct SANs. Keys are generated on the machine that will use them and never emailed or copied around. Certificate expiry is monitored and alerts before it matters, because monitoring is what turns a certificate outage into a ticket.

That last one is the difference between a CA that helps and a CA that becomes the thing that breaks everything twice a year.

## References

- [RFC 5280: X.509 Public Key Infrastructure Certificate and CRL Profile](https://www.rfc-editor.org/rfc/rfc5280.html)
- [RFC 8555: Automatic Certificate Management Environment (ACME)](https://www.rfc-editor.org/rfc/rfc8555.html)
- [RFC 6960: Online Certificate Status Protocol](https://www.rfc-editor.org/rfc/rfc6960.html)
- [NIST SP 800-52 Rev. 2: Guidelines for TLS Implementations](https://csrc.nist.gov/pubs/sp/800/52/r2/final)
- [OpenSSL documentation](https://docs.openssl.org/master/man1/openssl-req/)
- [step-ca documentation](https://smallstep.com/docs/step-ca/)
