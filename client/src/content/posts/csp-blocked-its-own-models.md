## A security header was breaking the feature it protected

This site has a Content Security Policy I am fairly proud of. It is tight:
no third party script hosts, no `unsafe-eval`, `object-src 'none'`,
`frame-ancestors 'none'`, `base-uri 'self'`, `form-action 'self'`. Every
directive has a comment above it explaining what it is for.

It was also silently breaking the 3D rack pages, which are the most
interesting thing on the site.

I did not find that by looking at the site. I found it by serving the built
files myself with the response headers the CDN actually sends, which is a
thing I had never done.

## The headers are not part of the build

Here is the gap. The site is static files on Cloudflare Pages, and the
headers come from a `_headers` file that Pages reads at deploy time. Nothing
in local development sends them. `vite preview` does not. So every check I
run against a local build runs against a page with no CSP at all.

The policy therefore had exactly one test environment: production.

That is worth saying plainly, because it is not obvious from the inside. A
static site feels like the simplest possible deployment, and the reasoning
goes that if the files are identical then the behaviour is identical. The
files are identical. The response is not.

So I wrote thirty lines of Node that serve `dist/public` and set one header:

```js
const CSP = process.env.CSP;
createServer((req, res) => {
  // ... resolve the file the way Pages does
  if (CSP) res.setHeader("Content-Security-Policy", CSP);
  res.end(readFileSync(file));
}).listen(4199);
```

Then I pulled the live policy off the real site and pointed a browser at it:

```bash
curl -sSI https://maxdoubin.com/ | grep -i content-security-policy
```

## Thirteen errors on one page

`/racks/wired` draws a rack of real hardware from compressed geometry. The
compression is Draco, and the decoder is WebAssembly:
`/draco/draco_decoder.wasm`, 192KB, deployed, served correctly as
`application/wasm`.

Under the real policy, the console said this thirteen times:

```text
WebAssembly.instantiate(): Refused to compile or instantiate WebAssembly
module because 'unsafe-eval' is not an allowed source of script
```

Compiling a WebAssembly module is gated by `script-src`, and my `script-src`
did not grant it. The decoder could not start, so the geometry could not be
decoded.

Underneath that were twenty six more:

```text
Refused to connect to 'blob:https://maxdoubin.com/71ef2cf0-...' because it
violates the following Content Security Policy directive: "connect-src 'self'"
```

The decoder runs in a worker it builds from a blob URL, and then fetches its
own module through that URL. `worker-src` allowed `blob:`, so the worker was
created. `connect-src` did not, so it could not load itself.

Two directives, both written carefully, neither wrong on its own terms.

## The fix is narrower than the obvious one

The error message names `'unsafe-eval'`, and that is the trap. Adding
`'unsafe-eval'` would fix it and would also re-enable `eval` and
`new Function` across the whole origin, which is most of what a CSP is for.

There is a keyword for exactly this case:

```text
script-src 'self' 'wasm-unsafe-eval'
```

`'wasm-unsafe-eval'` permits WebAssembly compilation and nothing else. String
evaluation stays blocked. It exists because the WebAssembly case is common
and the blunt fix is bad, and it is one of those tokens you only learn about
by reading the spec after you have already been tempted.

`connect-src 'self' blob:` covers the second. A blob URL is readable only by
the origin that created it, so this does not open a path off the site.

Both counts go to zero.

## Then the interesting part

With a way to test the policy, I could ask a question I had previously only
answered by assertion. `script-src` carried `'unsafe-inline'`, with this
comment above it:

> REQUIRED, and it is a known, accepted cost, not an oversight. Removing
> `'unsafe-inline'` means either a nonce (needs a per-request server; this
> deploys as static files) or a sha256 hash per block (one per page,
> regenerated on every content edit, in a header with a 2000 character
> ceiling). Neither fits.

I wrote that. It is careful, it reads as considered, and the premise is
wrong. So I counted:

```text
731 distinct inline <script> bodies across 382 pages
  382 pages  sha256-SwHGuGI0bYRIZC3y...  attrs=''
  382 pages  sha256-IReDYyal7pT6AGp9c...  attrs='type="application/ld+json"'
  ...
```

Two facts fall out of that.

**There is exactly one executable inline script on the entire site.** It is
the boot veil in `index.html`, which has to run before the first paint and so
cannot be a module. It is byte identical on all 382 pages, because it is the
same file. One hash covers everything.

**The other 730 are `application/ld+json`, and `script-src` does not gate
them.** The HTML parser treats a script element with a non-JavaScript type as
a *data block*. It never reaches the step where a script is prepared for
execution, so there is nothing for the policy to allow or refuse. I had
counted my structured data as inline script for years. It is not.

So `'unsafe-inline'` came out, one hash went in, and I checked the result the
way I should have checked the original: served the build under the new policy
and loaded nineteen routes, including both 3D pages and the game. The boot
script runs, React mounts, every JSON-LD block still parses, no violation is
raised anywhere.

## A hash is a promise that rots

A hash is stricter than a keyword and much easier to get quietly wrong. Edit
one character of that boot script, or let a formatter touch it, and the hash
stops matching. The script is then refused, the veil never runs, and every
visitor sees the page a moment before the entrance animation.

Nothing would fail. The site still works. It just works slightly worse
forever.

So the hash is checked by a build gate that recomputes it from the output:

```text
check-csp-hash: 1 executable inline script across 382 pages (382 instances),
every one allowed by a hash in _headers, and no 'unsafe-inline'.
```

It fails three ways: if the hash drifts, if a second executable inline script
appears anywhere in the build, or if `'unsafe-inline'` comes back and makes
the hash decorative. I broke it all three ways to check it says so.

## What I would take from this

**A response header is part of your application, and it probably has no
tests.** Anything set by the CDN rather than the build is invisible to
everything you run locally. Thirty lines of static server that set one header
found a broken feature that eleven other checks had passed.

**Read the error message past the first noun.** "'unsafe-eval' is not an
allowed source" is telling you which check failed, not which keyword you
should add. The right grant was narrower and the browser was never going to
suggest it.

**A careful comment is not evidence.** The `'unsafe-inline'` note was
specific, plausible, and load bearing, and its central claim was something
nobody had counted. Comments record what somebody believed when they wrote
them. This one had been true of a much smaller site.

**If you tighten something, gate it.** Removing `'unsafe-inline'` traded a
weak policy for a strict one plus a new way to fail silently. That trade is
only worth taking with something watching the hash.

## References

- [MDN: CSP `script-src`](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/script-src)
- [Content Security Policy Level 3: hash source expressions](https://www.w3.org/TR/CSP3/#grammardef-hash-source)
- [Content Security Policy Level 3: `unsafe-hashes` and the keyword grammar](https://www.w3.org/TR/CSP3/#grammardef-keyword-source)
- [WebAssembly and CSP: the `wasm-unsafe-eval` source](https://github.com/WebAssembly/content-security-policy/blob/main/proposals/CSP.md)
- [HTML Standard: the `script` element, and blocks of data](https://html.spec.whatwg.org/multipage/scripting.html#the-script-element)
- [MDN: `connect-src`](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/connect-src)
- [Cloudflare Pages: custom headers with a `_headers` file](https://developers.cloudflare.com/pages/configuration/headers/)
- [Draco 3D compression](https://google.github.io/draco/)
