## The padlock is green and four clients cannot connect

A new certificate went on an API host on a Monday morning. The person who
installed it loaded the URL in Chrome, got the padlock, checked the issuer and
the expiry date, and closed the ticket.

By afternoon four things were broken and none agreed on why.

```
curl: (60) SSL certificate problem: unable to get local issuer certificate
```

```
javax.net.ssl.SSLHandshakeException: PKIX path building failed:
sun.security.provider.certpath.SunCertPathBuilderException:
unable to find valid certification path to requested target
```

```
[SSL: CERTIFICATE_VERIFY_FAILED] certificate verify failed:
unable to get local issuer certificate
```

```
x509: certificate signed by unknown authority
```

curl, Java, Python and Go. Four wordings, one cause, and the person holding
the ticket can still load the site in a browser and cannot reproduce any of
them.

The certificate is correct. What is missing is the certificate above it, and
a browser does not notice because it goes and fetches it.

## A chain is built by the client, not handed to it

What a client validates is not the certificate but a path: an ordered sequence
from the leaf to something in the trust store, each certificate signed by the
next one up. RFC 4158 exists to describe this as a search problem.

A search needs candidates, and a client collects them from a short list of
places:

- the certificates the peer sent in the handshake
- the local trust store, which on most systems holds roots and nothing else
- certificates cached from earlier connections, if the client keeps a cache
- a live fetch over HTTP, if the client implements one

Publicly trusted roots do not sign leaf certificates. There is always an
intermediate in between, and it is not in your trust store, because trust
stores ship roots. So when the server sends only the leaf, the first two
sources are exhausted at once and the client is down to the third and fourth.
Whether those exist is a property of the client, and that is the whole
difference between Chrome and curl.

## What RFC 8446 requires the server to send

Section 4.4.2 of RFC 8446 is short and it is not ambiguous:

> The sender's certificate MUST come in the first CertificateEntry in the
> list. Each following certificate SHOULD directly certify the one immediately
> preceding it. Because certificate validation requires that trust anchors be
> distributed independently, a certificate that specifies a trust anchor MAY be
> omitted from the chain, provided that supported peers are known to possess
> any omitted certificates.

The misconception lives in that last sentence. People read "MAY be omitted"
and conclude that serving the leaf alone is supported. The permission is
narrower. It covers a certificate "that specifies a trust anchor", meaning the
root, and only where peers already have it. An intermediate is not a trust
anchor and no peer is known to possess it.

TLS 1.2 was stricter: RFC 5246 required that "Each following certificate MUST
directly certify the one preceding it". TLS 1.3 relaxed the ordering to a
SHOULD, having noted that some servers are "simply configured incorrectly" and
that clients should cope. It did not relax the requirement to include them.

## The browser goes and gets it

RFC 5280 section 4.2.2.1 defines the authority information access extension,
which "indicates how to access information and services for the issuer of the
certificate in which the extension appears". Where its `id-ad-caIssuers`
access method is used, "the additional information lists certificates that
were issued to the CA that issued the certificate containing this extension".
In practice: an HTTP URL serving one DER encoded certificate, the missing
intermediate, published by the CA.

Nothing in RFC 5280 tells a client to fetch it. Chrome does anyway, in
`net/cert/internal/cert_issuer_source_aia.cc`, a candidate issuer source wired
into the path builder alongside what the server sent:

```cpp
if (!cert->has_authority_info_access())
    return;
...
for (const auto& uri : cert->ca_issuers_uris()) {
    GURL url(uri);
    if (url.is_valid()) {
      if (urls.size() < kMaxFetchesPerCert) {
        urls.push_back(url);
```

under limits set just above, with a comment that does not oversell them:

```cpp
// TODO(mattm): These are arbitrary choices. Re-evaluate.
const int kTimeoutMilliseconds = 10000;
const int kMaxResponseBytes = 65536;
const int kMaxFetchesPerCert = 5;
```

Ten seconds, 64 KiB, five URLs per certificate. That is the mechanism behind
every "it works in Chrome": a fetch the browser made for you, with nothing in
the UI to say so.

Firefox reaches the same outcome without fetching. It pre-downloads the known
intermediates through Mozilla's Remote Settings infrastructure, specifically
to cover "one of the most common server configuration problems: not specifying
proper intermediate CA certificates". Windows and macOS fetch and then cache
what they retrieve, so once one browser on a machine has papered over the
problem, every tool there on the platform trust store inherits the fix.

OpenSSL does none of this, and neither does Go's `crypto/x509`. Java's PKIX
path builder can follow AIA, but only when
`com.sun.security.enableAIAcaIssuers` is set, and it ships disabled for
compatibility. Python's message matches curl's because both are OpenSSL
underneath. Those four errors are four projects declining to make an HTTP
request in the middle of a handshake.

## What the server is actually sending

One command answers it, and `-showcerts` is the whole point. The OpenSSL
manual is careful about what it shows: it "displays the server certificate
list as sent by the server: it only consists of certificates the server has
sent (in the order the server has sent them). It is not a verified chain."

```
$ openssl s_client -showcerts -connect api.example.com:443 \
    -servername api.example.com </dev/null 2>/dev/null \
  | grep -E '^ [0-9]+ s:'
 0 s:CN = api.example.com
```

One line. That is the bug, in one screen. A correct host shows two:

```
 0 s:CN = api.example.com
 1 s:C = US, O = Example CA, CN = Example CA Intermediate R3
```

The verification errors send people to the wrong end of the connection:

```
depth=0 CN = api.example.com
verify error:num=20:unable to get local issuer certificate
verify return:1
...
    Verify return code: 21 (unable to verify the first certificate)
```

Error 20 is `X509_V_ERR_UNABLE_TO_GET_ISSUER_CERT_LOCALLY` and error 21 is
`X509_V_ERR_UNABLE_TO_VERIFY_LEAF_SIGNATURE`. The first says "local" and is
telling the truth, in that the issuer was not found locally. It does not mean
the local store is at fault. I had already counted the certificates and seen
exactly one, and still spent twenty minutes updating a container's CA bundle,
because the error names my end and the fix was at the other end.

One more trap. `s_client` "is designed to continue the handshake after any
certificate verification errors", so it prints the error, completes the
connection and exits successfully. A check built around "did `s_client`
connect" passes on a broken chain. Add `-verify_return_error` and the
handshake aborts, which is what a script wants.

## fullchain.pem and cert.pem

On anything issued by certbot, the difference is one filename. The
documentation describes `fullchain.pem` as "All certificates, including server
certificate (aka leaf certificate or end-entity certificate). The server
certificate is the first one in this file, followed by any intermediates", and
says it "is what Apache >= 2.4.8 needs for SSLCertificateFile, and what Nginx
needs for ssl_certificate".

`cert.pem` next to it "contains the server certificate by itself". One
certificate, in the file whose name looks like the obvious answer to a
directive called `ssl_certificate`. That is the failure mode.

The server documentation agrees. Nginx: "If intermediate certificates should
be specified in addition to a primary certificate, they should be specified in
the same file in the following order: the primary certificate comes first,
then the intermediate certificates." Apache, since 2.4.8: "The files may also
include intermediate CA certificates, sorted from leaf to root."

Certbot's own warning is the best sentence on this subject. Use `cert.pem` and
you must also configure `chain.pem`, or "some browsers will show 'This
Connection is Untrusted' errors for your site, some of the time". Some of the
time. That is the bug, reported honestly.

```
$ grep -c 'BEGIN CERTIFICATE' /etc/letsencrypt/live/api.example.com/fullchain.pem
2
$ grep -c 'BEGIN CERTIFICATE' /etc/letsencrypt/live/api.example.com/cert.pem
1
```

## Why it is invisible to the person who installed it

Every check that person ran was contaminated. They tested in a browser, which
fetched or preloaded the missing piece, and on Windows and macOS the platform
cached what it fetched, so the next test from that machine succeeds even
outside a browser.

Meanwhile the failure concentrates in things with no screen: batch jobs,
service-to-service calls, mobile SDKs and probes. The probe is right and
nobody believes it, because the human in front of a browser has evidence and
the probe only has a number.

Certificates are renewed often enough now that this path is exercised
constantly, and [lifetimes are getting
shorter](/blog/certificate-lifetimes-are-200-days-now), so a deploy step that
writes the wrong file will do it again in weeks. On an internal CA the AIA URL
usually points at a host the client cannot reach, so the browsers stop
covering for you too, which is worth designing for when you [stand up a
private CA](/blog/internal-pki-private-ca).

## What to do

Point the server at the file with the chain in it, reload the service rather
than only write the file, then verify from somewhere that has never spoken to
the host. A container is fine, and is the point: fresh trust store, no cache.

The chain can also be checked offline, with no network at all:

```
$ openssl verify -untrusted chain.pem cert.pem
cert.pem: OK
```

`-untrusted` supplies the intermediates as candidates without trusting them,
which is the job the handshake is supposed to do. If that passes and the live
connection fails, the file is right and the server is not reading it. Then
make it a gate rather than a habit: the count of certificates the server sends
is something a script can assert on, in the renewal hook, next to the reload.

## The questions, in order

1. How many certificates does the server actually send? Count the index lines
   from `-showcerts`. One is the answer to everything below it.
2. Is the leaf's issuer among them? A chain that is present but wrong fails
   the same way, and looks different in that same output.
3. Which file does the running config name, and how many certificates are in
   it? `grep -c 'BEGIN CERTIFICATE'` settles that in one line.
4. Did anything reload after the file changed? A correct file nothing has read
   is indistinguishable from a wrong one.
5. Has the machine you are testing from already talked to this host? Then the
   test proves nothing, and neither does the browser.

None of those are about the trust store, and the trust store is the first
thing everybody changes. For the other ways a chain fails, there is a piece on
[what the client is actually checking](/blog/ssl-tls-certificates-explained).

You can work through nine chains, including the one where only the leaf is
served, at [nine servers, nine verdicts](/chain).

## References

- [RFC 8446 section 4.4.2, on certificate_list and what may be omitted](https://www.rfc-editor.org/rfc/rfc8446.html#section-4.4.2)
- [RFC 5246 section 7.4.2, the stricter TLS 1.2 wording](https://www.rfc-editor.org/rfc/rfc5246.html#section-7.4.2)
- [RFC 5280 section 4.2.2.1, authority information access and id-ad-caIssuers](https://www.rfc-editor.org/rfc/rfc5280.html#section-4.2.2.1)
- [RFC 4158, certification path building as a search problem](https://www.rfc-editor.org/rfc/rfc4158.html)
- [cert_issuer_source_aia.cc, where Chrome fetches the missing intermediate](https://chromium.googlesource.com/chromium/src/+/refs/heads/main/net/cert/internal/cert_issuer_source_aia.cc)
- [Preloading intermediate CA certificates into Firefox](https://blog.mozilla.org/security/2020/11/13/preloading-intermediate-ca-certificates-into-firefox/)
- [Java PKI Programmer's Guide, on com.sun.security.enableAIAcaIssuers](https://docs.oracle.com/en/java/javase/17/security/java-pki-programmers-guide.html)
- [openssl-s_client(1), on -showcerts and -verify_return_error](https://docs.openssl.org/master/man1/openssl-s_client/)
- [Certbot, on fullchain.pem, cert.pem and chain.pem](https://eff-certbot.readthedocs.io/en/latest/using.html#where-are-my-certificates)
- [nginx ssl_certificate, on the order of certificates in the file](https://nginx.org/en/docs/http/ngx_http_ssl_module.html#ssl_certificate)
- [Apache mod_ssl SSLCertificateFile, on intermediates since 2.4.8](https://httpd.apache.org/docs/2.4/mod/mod_ssl.html#sslcertificatefile)