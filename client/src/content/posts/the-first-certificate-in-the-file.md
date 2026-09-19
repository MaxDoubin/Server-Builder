## The expiry check is amber for a host nobody has heard of

A certificate expiry probe pointed at `198.51.100.20:443` has been green for a
year and is now nine days from red. The name on the certificate it found is
`admin.internal.example`. Nothing on that host is called that. The three sites
the box serves all renewed last week and all have eighty days left.

The probe is not broken and the certificate is not wrong. The server answered
a question nobody asked it. The probe connected to an IP address, so it had no
name to offer during the handshake, and the server did the only thing it can:
it handed back the certificate belonging to whichever server block it parsed
first.

Everything below follows from one ordering fact. TLS finishes before HTTP
starts, so the certificate is chosen before the `Host` header exists.

## The name arrives, if it arrives at all, in the ClientHello

The nginx documentation is blunt about the shape of the problem, in its
section on running two HTTPS servers on one address:

> The SSL connection is established before the browser sends an HTTP request
> and nginx does not know the name of the requested server. Therefore, it may
> only offer the default server's certificate.

Server Name Indication, RFC 6066 section 3, is the fix: the client puts the
name in the ClientHello, in the clear, ahead of all of that. The RFC is
specific about what may go in it.

> "HostName" contains the fully qualified DNS hostname of the server, as
> understood by the client.

And, a paragraph later:

> Literal IPv4 and IPv6 addresses are not permitted in "HostName".

That second sentence is the entire IP-address case. There is no legal SNI to
send for `https://198.51.100.20/`, so a correct client sends none and the
server is back to guessing. nginx adds a warning worth keeping: "Only domain
names can be passed in SNI, however some browsers may erroneously pass an IP
address of the server as its name if a request includes literal IP address.
One should not rely on this."

## The guess is the first server block, and it belongs to the port

For the plaintext case nginx states the rule directly:

> If its value does not match any server name, or the request does not contain
> this header field at all, then nginx will route the request to the default
> server for this port.

The default server is the first one defined for that listen address unless a
`listen` directive marks another with `default_server`, and the docs add the
part people forget: "Note that the default server is a property of the listen
port and not of the server name." No `server_name` value can make a block the
default. `server_name _;` is not a wildcard, just an invalid domain that never
collides with a real one.

Apache lands in the same place with different words:

> If no matching ServerName or ServerAlias is found in the set of virtual
> hosts containing the most specific matching IP address and port combination,
> then the first listed virtual host that matches that will be used.

On a Debian or Ubuntu nginx, "first" is decided by something nobody edited.
`include /etc/nginx/sites-enabled/*;` expands through `glob(3)`, which nginx
calls with a flags argument of zero:

```c
n = glob((char *) gl->pattern, 0, NULL, &gl->pglob);
```

No `GLOB_NOSORT`, and glob(3) says "By default, the returned pathnames are
sorted." So the default vhost on 443 is whichever site sorts first by
filename, behind anything in the `conf.d` glob Debian includes one line
earlier. A file called `admin` beats `www` on nothing but the alphabet, and
adding one called `000-staging` silently moves the target.

## One socket, two clients, two certificates

You can watch the whole mechanism without installing a web server.
`openssl s_server` does SNI selection: a default certificate, plus one name
given with `-servername` and its own `-cert2`.

```
$ openssl s_server -accept 127.0.0.1:4433 \
    -cert default.crt -key default.key \
    -servername www.example.org -cert2 shop.crt -key2 shop.key -www
```

`default.crt` is `CN=admin.internal.example` and `shop.crt` is
`CN=www.example.org`. Now two clients against that one socket.

```
$ openssl s_client -connect 127.0.0.1:4433 </dev/null 2>/dev/null \
    | openssl x509 -noout -subject
subject=CN = admin.internal.example

$ openssl s_client -connect 127.0.0.1:4433 -servername www.example.org \
    </dev/null 2>/dev/null | openssl x509 -noout -subject
subject=CN = www.example.org
```

Same port, same second, different certificate. Nothing on the server changed
between those two commands. The difference is a few bytes in the ClientHello.

## The test that looks right and proves nothing

This is the one that cost me an afternoon:

```
$ curl -sv -k -H 'Host: www.example.org' https://127.0.0.1:4433/ \
    -o /dev/null 2>&1 | grep -E 'subject:|Host:'
*  subject: CN=admin.internal.example
> Host: www.example.org
```

The `Host` header is exactly what was asked for, and the certificate is still
the default one. `-H` writes an HTTP header, and SNI is not an HTTP header. By
the time curl sends that line the handshake is over and the certificate was
already picked from a URL whose host is a literal IP, carrying no SNI at all.

`--resolve` does what people expect `-H` to do, because it changes where curl
connects without changing the name in the URL. The manual calls it "a sort of
/etc/hosts alternative provided on the command line":

```
$ curl -sv -k --resolve www.example.org:4433:127.0.0.1 \
    https://www.example.org:4433/ -o /dev/null 2>&1 | grep -E 'subject:|Host:'
*  subject: CN=www.example.org
> Host: www.example.org:4433
```

For openssl the equivalent is `-servername`, and its default is worth reading
exactly, because it decides what passing no flag means:

> If -servername is not provided, the TLS SNI extension will be populated with
> the name given to -connect if it follows a DNS name format.

So `-connect 127.0.0.1:4433` sends nothing, an IP not being a DNS name format,
while `-connect www.example.org:443` sends SNI whether or not you intended it.
When what you are testing is precisely what a client without SNI sees,
`-noservername` makes that deliberate rather than incidental. The other
failures that look identical from a browser are in
[what a certificate actually promises](/blog/ssl-tls-certificates-explained).

## When SNI and Host disagree, most servers do not mind

Two names now, two chances to be wrong, and only a client-side SHOULD NOT in
RFC 6066 asks them to match. nginx compares them byte for byte and returns
early if they are equal. If they are not, it finds the server block by `Host`
and then does this:

```c
sscf = ngx_http_get_module_srv_conf(cscf->ctx, ngx_http_ssl_module);

if (sscf->verify) {
    ngx_log_error(NGX_LOG_INFO, r->connection->log, 0,
                  "client attempted to request the server name "
                  "different from the one that was negotiated");
    ngx_http_finalize_request(r, NGX_HTTP_MISDIRECTED_REQUEST);
    return NGX_ERROR;
}
```

`sscf->verify` is `ssl_verify_client`. If the target block does not ask for a
client certificate there is no rejection at all: nginx serves that block's
content over the certificate SNI already chose, and logs nothing. The 421
arrived in nginx 1.11.0, described in the changelog as rejecting "requests to
a virtual server different from one negotiated during an SSL handshake". Read
the condition rather than the summary. That is a client-certificate
protection, not a general consistency check.

Apache added a general one later. `SSLVHostSNIPolicy`, available in httpd
2.4.66 and defaulting to `secure`, compares the SSL configuration of the vhost
named by SNI against the one named by `Host` and answers 421, which RFC 9110
defines as indicating "that the request was directed at a server that is
unable or unwilling to produce an authoritative response for the target URI".
It exists because of CVE-2025-23048, where a client trusted by one vhost's set
of client certificates could reach another through TLS 1.3 session resumption
unless `SSLStrictSNIVHostCheck` was on. Fixed in 2.4.64. nginx had the same
class of bug, CVE-2025-23419, fixed in 1.27.4.

## Make the default refuse instead of answer

The default vhost's job is to be wrong loudly. nginx has had a directive for
exactly that since 1.19.4, and its documented example gives the default server
no certificate at all:

```nginx
server {
    listen               443 ssl default_server;
    ssl_reject_handshake on;
}

server {
    listen              443 ssl;
    server_name         example.com;
    ssl_certificate     example.com.crt;
    ssl_certificate_key example.com.key;
}
```

In the source that setting resolves to three lines:

```c
c->ssl->handshake_rejected = 1;
*ad = SSL_AD_UNRECOGNIZED_NAME;
return SSL_TLSEXT_ERR_ALERT_FATAL;
```

which is the `unrecognized_name(112)` alert, sent fatal. RFC 6066 gives a
server exactly two choices here: "either abort the handshake by sending a
fatal-level unrecognized_name(112) alert or continue the handshake".
`ssl_reject_handshake` takes the first branch, literally. On port 80 the
equivalent is `return 444`, a "non-standard code 444" that "closes a
connection without sending a response header".

On Apache the switch is `SSLStrictSNIVHostCheck on` in the default
name-based vhost: "clients that are SNI unaware will not be allowed to access any virtual
host, belonging to this particular IP / port combination." It has existed since
2.2.12 and is off by default.

Refusing is defensible, not hostile. RFC 8446 lists `server_name` among the
mandatory-to-implement extensions for TLS 1.3 and says plainly that "Servers
MAY require clients to send a valid "server_name" extension". The cost is that
a client sending none gets nothing, which is the intended outcome, and nginx
gives the one alternative in a flat sentence: "for maximum interoperability
with clients that do not use SNI, virtual servers with different certificates
should listen on different IP addresses."

## Then fix the probe, not the certificate

The check in the first paragraph used an IP because an IP was what somebody
had at the time. Every check that connects by address reports the default
vhost forever, on every host, and keeps doing it after you re-issue the
certificate it complained about. Point it at the name and use `--resolve` when
DNS should not be the thing under test. The same goes for load balancer health
checks and for any
[reverse proxy in front of everything](/blog/nginx-reverse-proxy-setup) that
dials its backends by address.

## The questions, in order

1. Did the client send SNI at all? An IP address in the URL means no, by the
   RFC, not by accident.
2. If it did, what name arrived? `$ssl_server_name` in nginx logs it, and it
   has been there since 1.7.0.
3. Which server block is first on that listen port? Not first in the file you
   are looking at. First in the sorted glob.
4. Does `Host` match the SNI name? If not, assume the server served it anyway,
   because unless client certificates are involved it did.
5. What does the default vhost do with a name it does not know? If the answer
   is "hands over a certificate", that is the bug, and it is one line.

None of those is about the certificate, and the certificate is the first thing
everybody re-issues.

You can work through nine chains, validated check by check, including the
wildcard that does not cover the name people type, at
[certificate chain validation](/chain).

## References

- [RFC 6066, section 3: Server Name Indication](https://www.rfc-editor.org/rfc/rfc6066.html#section-3)
- [RFC 8446, section 9.2: Mandatory-to-Implement Extensions](https://www.rfc-editor.org/rfc/rfc8446.html#section-9.2)
- [RFC 9110, section 15.5.20: 421 Misdirected Request](https://www.rfc-editor.org/rfc/rfc9110.html#section-15.5.20)
- [nginx, on configuring HTTPS servers and SNI](https://nginx.org/en/docs/http/configuring_https_servers.html)
- [nginx, on request processing and the default server](https://nginx.org/en/docs/http/request_processing.html)
- [nginx, on server names and the "_" catch-all](https://nginx.org/en/docs/http/server_names.html)
- [ngx_http_ssl_module, for ssl_reject_handshake and $ssl_server_name](https://nginx.org/en/docs/http/ngx_http_ssl_module.html)
- [ngx_http_rewrite_module, on return and the non-standard code 444](https://nginx.org/en/docs/http/ngx_http_rewrite_module.html#return)
- [ngx_http_request.c, where an SNI and Host mismatch is decided](https://github.com/nginx/nginx/blob/master/src/http/ngx_http_request.c)
- [ngx_files.c, where the include glob is opened with no GLOB_NOSORT](https://github.com/nginx/nginx/blob/master/src/os/unix/ngx_files.c)
- [nginx changelog, where 1.11.0 adds the 421 response](https://nginx.org/en/CHANGES-1.12)
- [nginx security advisories, for CVE-2025-23419](https://nginx.org/en/security_advisories.html)
- [Apache, on name-based virtual hosts and the first-listed default](https://httpd.apache.org/docs/2.4/vhosts/name-based.html)
- [mod_ssl, for SSLStrictSNIVHostCheck and SSLVHostSNIPolicy](https://httpd.apache.org/docs/2.4/mod/mod_ssl.html)
- [Apache httpd 2.4 vulnerabilities, including CVE-2025-23048](https://httpd.apache.org/security/vulnerabilities_24.html)
- [openssl-s_client(1), on -servername and -noservername](https://docs.openssl.org/master/man1/openssl-s_client/)
- [curl(1), on --resolve](https://curl.se/docs/manpage.html#--resolve)
- [glob(3), on sorting of returned pathnames](https://man7.org/linux/man-pages/man3/glob.3.html)