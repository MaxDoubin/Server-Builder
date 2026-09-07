
## Six digits, thirty seconds, no network

The thing that should bother you about a TOTP code is that it works on a plane.
Your phone has no signal, the server is a thousand miles away, and the six
digits it shows are the six digits the server is expecting. Nothing was
exchanged. Nothing could have been.

That is the whole design. The phone and the server agreed on a secret once,
when you scanned the QR code, and they have both been watching the same clock
ever since. Everything else is arithmetic.

## What is actually in the QR code

The QR code is a URI, and you can read it. Mine look like this:

```text
otpauth://totp/lab.example:max?secret=JBSWY3DPEHPK3PXP
  &issuer=lab.example&algorithm=SHA1&digits=6&period=30
```

The `secret` is the shared secret, encoded in base32 (RFC 4648) because base32
survives being typed by a human when the camera will not focus. Each character
carries five bits, so the sixteen above are 80 bits, and RFC 4226 asks for at
least 128. The rest is metadata: which hash, how many digits, how long a step
lasts.

The moment that secret is generated, two copies of it exist. That fact drives
most of what follows.

## The algorithm, in full

TOTP (RFC 6238) is HOTP (RFC 4226) with a clock in place of a counter. HOTP is
an HMAC (RFC 2104) of a counter under the shared key, truncated to a few
digits. TOTP defines the counter as the number of time steps since the Unix
epoch:

```text
T = floor((unix_time - T0) / X)     with T0 = 0 and X = 30 seconds
```

Written out, the whole algorithm fits in a screen of Python and there is
nothing hidden in it:

```python
import base64, hashlib, hmac, struct, time

secret  = base64.b32decode("JBSWY3DPEHPK3PXP")
counter = int(time.time()) // 30

mac = hmac.new(secret, struct.pack(">Q", counter), hashlib.sha1).digest()

offset = mac[-1] & 0x0F                       # dynamic truncation
code   = struct.unpack(">I", mac[offset:offset + 4])[0] & 0x7FFFFFFF
print(f"{code % 10 ** 6:06d}")
```

Check it against a real implementation before you believe it:

```bash
oathtool --totp -b JBSWY3DPEHPK3PXP
```

Two details in that code are worth naming. The offset is read from the low
four bits of the last byte of the MAC, so which four bytes get used changes
every step: that is the "dynamic" in dynamic truncation, and it exists so an
attacker cannot attack a fixed slice of the HMAC output. The `& 0x7FFFFFFF`
clears the top bit, because RFC 4226 wanted the same answer from languages
that only have signed integers.

## Why six digits

Six is a usability decision with the security cost written down. RFC 4226
allows six to eight digits and requires at least six. A six digit code is a
million possibilities, so a blind guess succeeds one time in a million per
attempt, and an attacker who can make a million attempts inside one time step
wins outright.

That is why the RFC pairs the digit count with throttling rather than treating
it as a strength parameter. Six digits plus a hard attempt limit is fine. Six
digits with unlimited retries is a four to five character password. The digits
are not what is protecting the account; the rate limit is.

## Clock drift, and the window nobody documents

Both sides read `floor(unix_time / 30)`. If the phone's clock is eleven seconds
fast and the code is generated three seconds before a boundary, the phone is
already in step N+1 while the server is still in step N. The code is correct
and it does not validate.

RFC 6238 handles this by letting the validator try neighbouring steps. One step
back is the common setting, which accepts anything within roughly thirty to
sixty seconds of the truth. You can see the effect directly:

```bash
# What the server would accept with a window of one step either side
oathtool --totp -b --now "2026-08-25 09:00:00 UTC" -w 1 JBSWY3DPEHPK3PXP
```

The window is a real cost, not free tolerance. Every extra step you accept
multiplies the guessing surface by the number of live codes, and it extends
how long a stolen code stays useful. A window of one is a reasonable default.
A window of ten, which I have seen configured to stop support tickets from
phones with bad clocks, means a code is valid for five minutes. Fix the clocks
instead: run NTP on the server and let the phone sync from the network.

The better fix for a persistently skewed device is resynchronisation. The
verifier records how far off that user's last successful code was and applies
the offset next time, which is exactly how HOTP counter resync works.

## The replay window is the server's job

Nothing in the maths stops a code being used twice. The same six digits are
valid for the whole time step, so anyone who observes them has the remainder of
the step to use them.

RFC 6238 is explicit: after a successful validation, the verifier must not
accept another OTP for the same time step from that user. In practice that is
one column.

```sql
ALTER TABLE totp_credential ADD COLUMN last_step BIGINT NOT NULL DEFAULT 0;
-- accept only if the presented step is strictly greater than last_step,
-- then write it back inside the same transaction
```

If you are reviewing an implementation, this is the first thing to look for and
the thing most often missing. Without it, a code shoulder-surfed off a screen,
or captured in a proxy, works again for as long as the step lasts.

## Why TOTP is phishable and WebAuthn is not

A TOTP code is a bearer token. It proves someone holds the secret. It does not
say anything about who they are talking to.

The attack is a proxy. A user lands on a lookalike site, the site relays the
login to the real one, the real one asks for a code, the lookalike asks the
user, the user types it, and the proxy replays it inside the same thirty
second step. Every step of that is normal protocol use. The user did nothing
wrong and there is no field in the exchange where the site's real identity
could have been checked, because the code is computed from a clock and a
secret and nothing else.

WebAuthn removes the bearer token entirely. The authenticator holds a private
key, generates a signature over a challenge, and includes the relying party ID
in what it signs. The browser supplies that ID from the origin it is actually
connected to, and the authenticator refuses to use a credential registered for
`login.example.com` when the page is `login.examp1e.com`. The proxy cannot
forward what it cannot get signed for its own name.

The second difference matters for anyone running a service. TOTP seeds are
symmetric secrets sitting in your database. A dump gives an attacker working
second factors for every user. WebAuthn stores public keys, and a dump of
those is worth nothing.

## What this means in practice

TOTP is a large improvement over a password alone. It stops credential
stuffing, password reuse, and every attack that ends with a database of
hashes. It does not stop a live phishing proxy, and no amount of configuration
will make it.

So: hardware-backed WebAuthn on anything with real access, TOTP everywhere
that does not support it yet, and never SMS. On the services I run, that means
passkeys for administrators, TOTP for regular accounts, a validation window of
one step, a replay check on the step number, and a lockout after five failed
codes. NIST SP 800-63B says the same thing in more careful language, and it is
worth reading the section on look-up secrets and out-of-band authenticators
before choosing anything else.

## References

- [RFC 6238: TOTP, Time-Based One-Time Password Algorithm](https://www.rfc-editor.org/rfc/rfc6238.html)
- [RFC 4226: HOTP, An HMAC-Based One-Time Password Algorithm](https://www.rfc-editor.org/rfc/rfc4226.html)
- [RFC 2104: HMAC, Keyed-Hashing for Message Authentication](https://www.rfc-editor.org/rfc/rfc2104.html)
- [RFC 4648: The Base16, Base32, and Base64 Data Encodings](https://www.rfc-editor.org/rfc/rfc4648.html)
- [NIST SP 800-63B revision 4: Digital Identity Guidelines, Authentication](https://pages.nist.gov/800-63-4/sp800-63b.html)
- [W3C Web Authentication Level 3](https://www.w3.org/TR/webauthn-3/)
- [oathtool(1)](https://man.archlinux.org/man/oathtool.1)
