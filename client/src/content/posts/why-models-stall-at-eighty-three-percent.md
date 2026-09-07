
## Eighty three percent, forever

The rack pages on this site load ten glTF files, one per device, and draw them
into one scene. On a desktop this is unremarkable. On an iPhone the progress
readout would climb to something like "38 of 46 models, 83%" and then stop.
Not slow down. Stop. Ten minutes later it still said 83%.

The interesting part of this bug is that the requests did not fail. There was
no error, no timeout, no rejected promise, nothing in the console. Eight
models were simply in a state of having been asked for and never answered,
and the code waiting on them waited for the rest of the session.

## Two wrong answers first

I want to record the wrong turns, because both were plausible and one of them
produced a real improvement that fixed nothing.

**Wrong answer one: the transcoder.** Each `GLTFLoader` was being handed its
own `KTX2Loader`, so ten models meant ten Basis transcoders, each with its own
WebAssembly instance and worker pool. That is genuinely wasteful and I fixed
it, sharing one transcoder across every loader. It could not have been the
cause, and I should have known that before writing the fix: these models
carry no KTX2 at all. Their textures are `EXT_texture_webp`. The transcoder I
was so pleased to have deduplicated was never being invoked.

**Wrong answer two: the Dell page works, so it must be about count.** One page
on the site shows a single Dell rack as one large model and it never stalled.
I read that as "one request is fine, ten requests are not" and started
thinking about connection limits. That is the wrong reading of the same clue,
and I made it twice. The Dell page works not because it makes one request
instead of ten, but because being one model means **its textures decode
alone**.

That second sentence is the whole bug.

## What is actually happening

Textures in these files are embedded, not external. So ten models is not ten
downloads. It is ten downloads and roughly thirty six image decodes, all
handed to the browser inside the same tick, because all ten loaders start at
once and each one hits its images at about the same moment.

Which decode path those thirty six images take depends on the browser, and
three.js chooses it from the user agent. This is the actual line, from
`GLTFLoader.js`:

```js
if ( typeof createImageBitmap === 'undefined'
     || ( isSafari && safariVersion < 17 )
     || ( isFirefox && firefoxVersion < 98 ) ) {
  this.textureLoader = new TextureLoader( this.options.manager );
} else {
  this.textureLoader = new ImageBitmapLoader( this.options.manager );
}
```

So an older iPhone decodes through an `HTMLImageElement` pointed at a blob URL,
and a current one goes through `createImageBitmap` on a worker. I want to be
careful here, because I got this wrong the first time I wrote it up and
asserted the `<img>` path as the mechanism on all of iOS. It is not: Safari 17
and later takes the other branch.

What I can state from measurement is narrower, and it is enough:

- The stall is real, reproducible on the reporter's device, and always in the
  same shape. Some subset of models never resolves.
- Nothing fails. No rejected promise, no `error` event, no console output, no
  network entry in a failed state.
- Capping how many models load at once removes it entirely, and the cap that
  works is small: two on a phone.

What I am inferring, and cannot prove from here, is why: that thirty six
simultaneous decodes exceed what the engine will finish on a memory
constrained device, and that whichever path it is on, the work is abandoned
without the abandonment being reported. Both paths have the same failure
shape from the caller's side, which is a promise or an event that never
arrives.

That distinction matters for what you do about it. If the mechanism were a
specific decode path I could route around it. Because it is concurrency
pressure, the fix is a limit, and the limit is right whichever branch a given
phone takes.

## The fix that made it worse

The obvious response is to stop asking for everything at once, so I put the
devices behind a sliding window. Mount the first few, and each one that
finishes lets the next one start.

```ts
// The first version. Do not ship this.
return { visible: Math.min(total, ready + limit), markReady };
```

Read that carefully with the bug in mind. `ready` only rises when a model
resolves. The bug is that a model sometimes never resolves. So one stuck decode
means `ready` stops rising, the window never widens, and every device behind
it never even starts.

I turned a page that loaded most of its models and stopped into a page that
loaded four and stopped. The report I got back was "stuck at 81 percent,
21 of 26", which is a *worse* number than the one I was trying to fix. Any
bounded queue needs a way out of a slot that never returns, and I had built
one without.

## The fix that worked

A stall timer. If nothing has completed for a while, open one more slot
anyway:

```ts
const STALL_MS = 8000;

const stalled = ready + grace;
useEffect(() => {
  if (ready + grace >= total) return;
  const t = window.setTimeout(() => setGrace((g) => g + 1), STALL_MS);
  return () => window.clearTimeout(t);
}, [stalled, ready, grace, total]);

return { visible: Math.min(total, ready + grace + limit), markReady, ready };
```

Three details in there matter.

**The timer restarts on every completion**, because the effect depends on
`ready + grace`. A rack that is merely slow opens one extra slot at a time
rather than all of them at once, so the window degrades towards unbounded
instead of jumping there.

**Completion is keyed, not counted.** A device can re-render for reasons that
have nothing to do with loading, a selection change or a dim toggle, and
counting those would widen the window early and put us straight back into the
original problem.

```ts
const markReady = useCallback((key: string) => {
  if (done.current.has(key)) return;
  done.current.add(key);
  setReady(done.current.size);
}, []);
```

**The width depends on the device.** A coarse pointer is the nearest thing to a
reliable "this is a phone" signal that does not involve parsing a user agent,
and phones are where this breaks:

```ts
function concurrency(): number {
  if (typeof window === "undefined" || !window.matchMedia) return 3;
  return window.matchMedia("(pointer: coarse)").matches ? 2 : 4;
}
```

Total bytes are unchanged. The rack still fills in visibly, device by device,
which if anything reads better than everything appearing at once. The browser
is simply never holding more decodes than it can finish.

## What generalises

**A silent failure needs a timeout, not better error handling.** There was no
error to handle. Any queue whose slots are freed by a callback needs an escape
hatch for the callback that never arrives, and it is worth writing that on the
first version rather than the third.

**Count the work, not the requests.** Ten files sounds like ten units of work.
It was ten downloads plus thirty six decodes, and the decodes were the
constraint. Whatever your concurrency limit is written in terms of, check that
it is the thing that actually runs out.

**A clue that fits two theories has told you nothing.** "The single model page
works" was compatible with a connection limit and with a decode limit, and I
picked the first one twice without asking what would distinguish them. The
distinguishing test was cheap: load ten copies of the same tiny model, versus
one model with ten textures. I could have run it on day one.

**Deduplicating something wasteful is not the same as fixing something broken.**
Sharing one transcoder was a real improvement to code that should have been
written that way. It was also, on these files, a change to a code path that
never executes. Two improvements landing in the same week does not make one of
them the cause of the other's symptom, and saying it did was the actual
mistake.

## References

- [three.js GLTFLoader](https://threejs.org/docs/#examples/en/loaders/GLTFLoader)
- [three.js source: how GLTFLoader picks its texture loader](https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/jsm/loaders/GLTFLoader.js)
- [MDN: createImageBitmap](https://developer.mozilla.org/en-US/docs/Web/API/Window/createImageBitmap)
- [MDN: HTMLImageElement.decode](https://developer.mozilla.org/en-US/docs/Web/API/HTMLImageElement/decode)
- [glTF extension: EXT_texture_webp](https://raw.githubusercontent.com/KhronosGroup/glTF/main/extensions/2.0/Vendor/EXT_texture_webp/README.md)
- [MDN: matchMedia and the pointer media feature](https://developer.mozilla.org/en-US/docs/Web/CSS/@media/pointer)
- [MDN: ImageBitmap](https://developer.mozilla.org/en-US/docs/Web/API/ImageBitmap)
