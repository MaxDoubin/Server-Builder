## A page that passed every check and was broken anyway

Five articles on this site were shipping with about a third of each one
inside a stylesheet.

Not visibly. Open one in a browser and it looked normal, because React
mounts over the prerendered markup a moment after the page arrives and
paints the article correctly from data. What was wrong was the document the
server actually sent: the copy a crawler reads, the copy a reader gets with
JavaScript off or before the bundle lands, and the copy that decides what
the page is understood to be about.

In that copy, the page shell had been spliced into the middle of the
article, and `<pre>`, `<code>`, `<article>` and `<main>` were left open for
the rest of the document.

Eleven checks had run on those pages and passed. The pages had a title, a
description, a canonical URL, valid structured data, resolving links, and
enough body text to clear a minimum-length floor. Every one of those
questions had a correct answer. None of them was the question that mattered.

## The second argument of String.replace is not a string

This is the whole bug:

```js
html.replace(pattern, `<div id="root">${content}</div>`);
```

`String.prototype.replace` does not take a replacement string. It takes a
replacement *template*, and a dollar sign in it starts a substitution:

| Sequence | Inserts |
| --- | --- |
| `$$` | a literal dollar |
| `` $` `` | the text before the match |
| `$'` | the text after the match |
| `$&` | the entire match |
| `$1` to `$99` | a numbered capture group |
| `$<name>` | a named capture group |

So if `content` contains `$&`, it does not appear in the output. The matched
substring appears instead. The matched substring here was the page shell,
because the pattern was looking for the shell in order to replace it.

The article does not get the dollar. The article gets a copy of the page.

## The trigger was a regex anchor in a shell snippet

The post that surfaced it is about configuration management, and it contains
this line:

```bash
if ! dpkg-query -W -f='${Status}' nginx 2>/dev/null | grep -q "^install ok installed$"; then
```

There is no `$&` in that. There is a `$` at the end of a `grep` pattern,
which is the ordinary way to anchor a match to the end of a line, followed by
the quote that closes the shell string.

The escaping is what completes the sequence. Before the article reaches the
replacement it is escaped for HTML, and escaping turns `"` into `&quot;`. So
`installed$"` becomes `installed$&quot;`, and `$&` is now sitting in the
middle of it.

That is the part worth keeping. **Escaping made the value more dangerous,
not less.** The escaper is what supplies the ampersand. Any dollar
immediately before a character that escapes to an entity is enough:

```text
$"   ->  $&quot;
$&   ->  $&amp;
$<   ->  $&lt;
$>   ->  $&gt;
```

Four ways in, and one of them is a regex anchor at the end of a quoted
string, which is a normal thing to write in an article about shell scripts.

## The fix is to stop passing a template

A replacement *function* returns a string that is used literally. Nothing in
it is a pattern:

```js
html.replace(pattern, () => `<div id="root">${content}</div>`);
```

That is the whole change for the splice. Seventeen other places on this site
interpolated a value into a replacement string, mostly the title and the
Open Graph and Twitter tags, and those genuinely need their `$1` and `$2`
backreferences, so there the value itself is escaped instead:

```js
const literal = (value) => value.replace(/\$/g, "$$$$");
```

Four dollars, because that expression is itself a replacement template: `$$`
means one literal dollar, so `$$$$` means two, which is the escape the next
call will read as one. A helper that has to escape itself is a fair sign the
API is sharp.

A title carrying a dollar can no longer corrupt a meta tag either. It never
had, but only because nobody had written one.

## What nothing noticed looks like

While reading the built pages afterwards I found a second fault from the same
function: every page, all three hundred and seventy seven of them, shipped
one `</div>` too many. The pattern stops at a `<style>` that sits before the
element's own closing tag, so the original close survives the replacement,
and emitting another one left three closes against two opens.

Browsers drop an unmatched end tag without complaint. Nothing ever looked
wrong. It was invalid on every page for as long as the function had existed.

Both faults share a shape: they are silent. HTML has no compiler. A document
with a stray `</div>` renders. A document with `<main>` left open renders.
The parser is specified to recover from exactly these mistakes, which is a
good property for the web and a bad one for anybody hoping to be told.

## The check existed and was not running

The part I found hardest to like: a checker in this repository already knew
about the splice. It described the mechanism in forty lines of comment, named
the function, named the file, and quoted the fix.

It was wired to nothing. Written, committed, and never added to the workflow,
along with two others. One of those two named an `http://` citation in an
article and said the fix was a single character.

A gate that does not run is worse than no gate, because the file in the tree
says the check exists. Somebody wrote all three carefully, and the care went
nowhere for want of four lines of YAML.

## What I would take from this

**Treat `String.replace` with a string replacement as a footgun.** If the
replacement contains anything you did not type yourself, use a function. The
performance difference is nothing and the class of bug disappears.

**Escaping is not sanitising.** An HTML escaper makes a value safe to put in
HTML. It says nothing about the value being safe to put through a regex
substitution on the way there, and here it actively created the hazard.

**Ask what a passing check does not cover.** Eleven of them passed these
pages. Each was asking a real question. None was asking whether the document
parsed, which is the one question that would have caught it, and the check
that did ask it was not plugged in.

**Read the built output, not the source.** Everything in the source was
correct. The corruption happened in the last step before the file was
written, which is a step people rarely look at because it usually works.

## References

- [MDN: String.prototype.replace](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String/replace)
- [MDN: specifying a string as the replacement, and the `$` patterns](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String/replace#specifying_a_string_as_the_replacement)
- [MDN: specifying a function as the replacement](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String/replace#specifying_a_function_as_the_replacement)
- [ECMAScript specification: GetSubstitution](https://tc39.es/ecma262/multipage/text-processing.html#sec-getsubstitution)
- [HTML Standard: an introduction to error handling and strange cases in the parser](https://html.spec.whatwg.org/multipage/parsing.html#an-introduction-to-error-handling-and-strange-cases-in-the-parser)
- [MDN: HTML character references](https://developer.mozilla.org/en-US/docs/Glossary/Character_reference)
