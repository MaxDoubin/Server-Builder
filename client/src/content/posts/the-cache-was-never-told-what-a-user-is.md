## The application never ran

A user reloads a dashboard and sees another account's name on it. Every
instinct says session handling: a token mixed up, a thread local reused, a
global that should not be. That is where everybody looks, and everything they
find is correct, because the application never ran.

A shared cache answered from storage. And it answered correctly, according to
the only thing it was told to key on.

I built seven sequences of requests through one cache implemented to RFC 9111.
Five of them serve one account's page to another. Here is the shape of the
set:

```
7 sequences
21 requests
 9 answered from storage
 5 leak
```

And here is the thing that makes it worth building rather than describing. In
five of the seven, three requests from three different accounts produce **one
key**:

```
case                              requests  accounts  distinct keys
no headers at all                        3         2              1
it says private                          3         2              1
a Vary, and the wrong one                3         3              2
s-maxage let it in                       3         2              1
a stored Set-Cookie                      3         3              1
Vary: Cookie, defeated                   3         3              2
three visitors, one copy                 3         3              1
```

A cache keys on the method, the URL, and exactly those request headers the
response named in `Vary`. Not the cookie, unless Vary says Cookie. Not the
token, unless Vary says Authorization. It does not know what a user is, and it
is not supposed to.

## Adding a Cache-Control directive can make it worse

This is the finding I did not expect, and it is exact rather than a tendency.

There is a rule in RFC 9111 that protects authenticated endpoints by default,
and almost nobody knows it: a shared cache must not store a response to a
request carrying an `Authorization` header. It has exactly three exceptions.

I ran seven common `Cache-Control` values through the model, on a request with
a bearer token:

```
Cache-Control                  shared cache stores it?
(none set)                     no
max-age=60                     no
private, max-age=60            no
no-store                       no
public, max-age=60             YES
max-age=30, s-maxage=3600      YES
must-revalidate, max-age=60    YES
```

Three of the seven switch the protection off. They are `public`, `s-maxage`
and `must-revalidate`, and that list is not a coincidence of my
implementation; it is the list, spelled out in section 3.5.

Look at the first two rows and the last one together. An endpoint behind a
bearer token with **no cache headers at all** is safe. The same endpoint with
`must-revalidate` is not. So adding a directive whose name sounds like the
cautious option turns off the rule that was protecting you.

`s-maxage` is the same trap wearing different clothes. It is the correct
directive for "let the CDN hold this longer than browsers do", it is what
anybody would reach for, and it is on the list. One of my seven sequences is
an endpoint that ran for a year on `max-age=30` and was safe by a mechanism
nobody had chosen, until somebody added `s-maxage=3600` for a good reason and
the next caller with a different token got the first caller's data.

And note what is **not** on the list: `max-age`. The most common directive
there is does not opt a shared cache back in. Which means the difference
between safe and not is `max-age=30` against `s-maxage=30`, and no reviewer
alive is going to catch that.

## Four ways for Vary to be present and useless

`Vary` names which request headers are part of the key. It is a list, not a
safety property, and "is Vary set" is the wrong question. Four failures from
the set:

**The wrong header.** `Vary: Accept-Encoding` on a per-account API response.
It ships through review because a Vary header is present and the diff looks
right. Accept-Encoding is the one nearly every response carries, because
compression genuinely does change the bytes, and it is worth nothing here.

**The right header, keyed wrong.** `Vary: Cookie` keys on the value of the
Cookie header, all of it, as one opaque string. There is no way in HTTP to say
vary on the session and ignore everything else. So a consent banner that sets
one cookie before anybody signs in produces this:

```
r1  acct-8812  GET /reports/monthly · cookie=consent=all
r2  acct-4471  GET /reports/monthly · cookie=consent=all
r3  acct-1290  GET /reports/monthly · cookie=consent=all; theme=dark
```

Two identical keys and one that differs, and the one that differs is protected
by a theme preference. Nothing about that arrangement was designed. The bug
arrived with the consent banner, in a change that touched no caching code and
no reporting code.

**No header at all.** The commonest case, and the least dramatic: a route
added last week, no cache headers set because nobody thought of it as a
cacheable route, and a CDN with a default TTL that treats silence as
permission. Both halves are omissions. Nothing is misconfigured.

**A header that is not in the body.** A pricing page, genuinely public, byte
for byte identical for everybody, correctly marked cacheable, that also sets
an analytics cookie. What gets stored is the response, and `Set-Cookie` is
part of a response, so the second visitor is handed the first visitor's
identifier and so is everybody for the next five minutes. HTTP/1.0 forbade
storing a response with `Set-Cookie`; RFC 9111 does not, precisely because
the useful cases exist and the caller is expected to know.

## private does not mean what people think, and is still right

`Cache-Control: private` is the correct answer and the reasoning people use to
justify it is wrong, which matters because the wrong reasoning fails on the
next route.

It does not mean the response is confidential. It does not mean it will not be
sent to the wrong person. It means one thing: a shared cache must not store
this. A browser cache may, happily, which is the point of the name and why
`private, max-age=600` is a sensible pair.

One of the seven is a settings page marked `private, max-age=600`, and nothing
leaks. All three requests reach the origin. That is the cost of correctness on
that route and it is the right cost.

The useful thing about having that case in the set is that it is
indistinguishable from the leaking one by looking at the page. The fault in
the first case was not a missing `private` on that route. It was that the
default was permissive, and a route added next week will have the same problem
for the same reason.

## The check that found my own model wrong

The gate replays each sequence and then checks the result against a second
implementation that keeps no state: for each request, look back for the
nearest earlier request with the same key and decide from that one alone.

The two disagreed on the very first run, and working out which was right found
a real error. Not in the cache, in my recomputation: **a request that hits
never reaches the origin.** So the response paired with it in the data never
existed and could not have been stored. The lookback was treating hypothetical
responses as fetched ones.

That is a bug I would not have found by reading either implementation, because
each is internally consistent. It only appears when they are asked the same
question.

## And the check that found the model could not say "public"

The gate also verifies that every fix a case states actually works: it applies
the remedy to that case's own requests and replays them.

On the Set-Cookie case, the fix is to strip the header. Applying it left the
case still reporting a leak, because the model had no way to record that a
response belongs to nobody in particular. Every hit on a public page counted
as one account receiving another's data.

Which would have made the whole page argue that caching is unsafe. It is not.
Two of the three requests in the last sequence are answered from storage,
neither is a leak, and that is the return on caching a public page. A shared
response is a problem only when something in it belongs to one person, and the
skill is telling those two apart. The difference is not visible in the body,
the URL, the `Cache-Control` or the hit rate. It is in the response headers,
which is where nobody looks.

## A blind spot in how I was checking answers

Worth writing down because it generalises past this page.

Each case offers four options and asks which request receives somebody else's
data. Three requests plus "none of them" is four possible answers, so the four
options cover the whole space. That felt tidy. It is a hole.

I broke the key computation so it ignored `Vary` entirely, expecting the gate
to shout. It produced one complaint, and the complaint was about answer
positions being unevenly distributed. The reason: a model change that merely
*moves* the answer to a different request still finds exactly one option
matching it. The exactly-one-option check has no power against a shifted
answer when the options exhaust the answer space.

The only thing that catches it is a property about the key itself, so
`keyOf()` now has two: requests differing in a header Vary names must get
different keys, and requests agreeing on every header Vary names must get the
same one. With those in place the same breakage produces 8,805 problems.

`freshness()` was the same story and worse. Its only caller uses it to ask
whether *any* lifetime is present, so which one it picks was never observed. I
stopped it reading `s-maxage` and nothing anywhere changed. That is the third
function today that had no property of its own and turned out to be breakable
in silence.

## The rule that would have prevented all five

```
Cache-Control: private, no-store
```

On anything with a session in it, applied by the framework rather than route
by route. Every one of these faults arrived because a default was permissive
and a person had to remember, and a route added next quarter will not
remember.

Then two habits. Strip `Set-Cookie` at the CDN on every cached path, as a
blanket rule, so a header added later cannot undo it. And in review, read what
`Vary` names rather than that it exists.

You can work through the seven sequences at [the page that showed somebody
else's name](/cache).

## References

- [RFC 9111: HTTP Caching](https://www.rfc-editor.org/rfc/rfc9111)
- [RFC 9111 section 3.5, on requests with Authorization](https://www.rfc-editor.org/rfc/rfc9111#section-3.5)
- [RFC 9111 section 4.1, on calculating cache keys with Vary](https://www.rfc-editor.org/rfc/rfc9111#section-4.1)
- [RFC 9111 section 5.2.2, on the response directives](https://www.rfc-editor.org/rfc/rfc9111#section-5.2.2)
- [RFC 9110: HTTP Semantics](https://www.rfc-editor.org/rfc/rfc9110)
- [MDN on Vary](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Vary)
- [MDN on Cache-Control](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Cache-Control)
