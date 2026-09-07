## One Tab, and there was no way out

The search palette on this site opens with Command-K or a slash, puts the
cursor in a text field, and closes on Escape. That is what I built and that
is what I had tested, because testing it means opening it and pressing
Escape, and the cursor is in the text field when you do.

Press Tab first, once, and the palette could not be closed with a keyboard at
all.

I found it by writing a test that did the obvious rude thing: open the
dialog, press Tab twenty five times, then press Escape. The palette stayed
open. Forty more tabs did not help. There was no key that closed it, and
because the dialog correctly traps focus, there was nowhere else to go
either.

The way out was clicking the backdrop, which is not a way out.

## Two correct decisions that were wrong together

Both halves of this were deliberate.

The tab trap is deliberate. A modal that lets Tab wander into the page
behind it is worse than one that does not claim to be modal, because the
reader is now operating controls they cannot see. So the dialog keeps focus
inside itself:

```jsx
<div role="dialog" aria-modal="true" onKeyDown={trapTab}>
```

Escape on the input is deliberate too. The input is where the palette's
other keys live: Arrow Down and Arrow Up move the highlighted result, Enter
opens it. Escape is a text-field key in the same family, so that is where it
was written:

```jsx
<input onKeyDown={onKeyDown} />   // Escape, ArrowDown, ArrowUp, Enter
```

Each is reasonable on its own. Together they make a room with a lock on the
inside of the door and the key in a drawer you cannot reach.

The bug is not in either handler. It is in the pairing, and neither file
looks wrong when you read it.

## Escape belongs to the dialog

The fix is to move one branch up one level:

```jsx
const onDialogKeyDown = (e) => {
  if (e.key === "Escape") { e.preventDefault(); close(); return; }
  if (e.key !== "Tab") return;
  // ... the trap
};
```

Keys bubble, so a handler on the dialog catches Escape from the input, from
any result row, and from anything added to the modal later. That last part is
the real gain: the bug came back the moment somebody made a second thing
focusable, and putting the key on the container means it cannot.

The arrow keys and Enter stay on the input. Those are search-box behaviour.
Escape is dialog behaviour. Sorting the keys by which thing they belong to,
rather than by which element happens to have focus when you test, is the
lesson.

## Why the usual testing misses it

WCAG has a criterion for this. It is 2.1.2, No Keyboard Trap, and it is
Level A, the lowest bar there is:

> If keyboard focus can be moved to a component of the page using a keyboard
> interface, then focus can be moved away from that component using only a
> keyboard interface.

An automated accessibility checker does not catch it. There is nothing wrong
with the markup: the dialog has a role, it has `aria-modal`, it has an
accessible name, every control is reachable, every control has a visible
focus ring. The static properties are all correct. The fault only exists in
a sequence of two key presses.

Nor does a human tester catch it reliably, because a human tester opens the
palette and the cursor is already in the field. You have to do the thing
nobody does on purpose, which is press Tab in a dialog that has just given
you a text cursor.

So it wants a test that behaves like nobody: press the keys in the wrong
order, then check you can still leave.

```js
await page.keyboard.press('Control+k');
await page.keyboard.press('Tab');
await page.keyboard.press('Escape');
// the dialog must be gone
```

Three lines. The equivalent of them is now the thing I write first for
anything modal.

## What I checked afterwards

Having found one, I went looking for the others. Three overlays on this site
can be open at once with the page behind them:

The mobile navigation drawer was already right, and interestingly not by
being a dialog. It is a disclosure with `aria-expanded`, and its focus loop
deliberately spans the site header as well as the drawer, because the button
that closes it lives in the header and `aria-modal` would have hidden that
button from assistive technology. Thirty tabs never left the loop, Escape
closed it, and focus went back to the toggle. Somebody had thought about it
properly and written down why.

The equipment picker in the 3D scene had nothing at all. No role saying what
it was, no name, no focus moved into it, no trap, no Escape. It was a full
screen overlay dismissable only by clicking. It now follows the same pattern
as the keyboard shortcuts dialog in the same directory, which had been
written correctly all along and even says so in its own docstring.

That is the pattern I keep meeting on this site: the good version of a thing
already exists somewhere in the tree, and the broken version is the one
written later by someone who did not know to look.

## What I would take from this

**Test the sequence, not the state.** Everything about the palette was
correct at rest. The fault needed two key presses in an order nobody chooses.

**Put a dismiss key on the container, not the control.** A handler on the
element that happens to have focus first is a handler that stops working the
moment focus moves. Escape is a property of the dialog.

**A focus trap raises the stakes on every other bug.** Trapping focus is the
right thing to do, and it converts "this key does not work" into "you cannot
leave". If you trap, the dismiss path is no longer a convenience.

**Look for the version somebody already got right.** Both fixes here were
copies of a correct implementation sitting a few files away.

## References

- [WCAG 2.2, Success Criterion 2.1.2: No Keyboard Trap](https://www.w3.org/TR/WCAG22/#no-keyboard-trap)
- [WCAG 2.2, Success Criterion 2.1.1: Keyboard](https://www.w3.org/TR/WCAG22/#keyboard)
- [ARIA Authoring Practices Guide: the dialog (modal) pattern](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/)
- [ARIA Authoring Practices Guide: keyboard interaction for a modal dialog](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/#keyboardinteraction)
- [MDN: the `aria-modal` attribute](https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Attributes/aria-modal)
- [MDN: event bubbling](https://developer.mozilla.org/en-US/docs/Learn_web_development/Core/Scripting/Event_bubbling)
