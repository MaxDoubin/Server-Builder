/**
 * Load a rack's models a few at a time instead of all at once.
 *
 * The wired rack asks for ten glTF files, and their textures are embedded,
 * so what the browser is really handed is ten downloads and around thirty
 * six image decodes kicked off in the same tick. On a desktop that is fine.
 * On a phone it is not: past some number of simultaneous decodes, some of
 * them never complete. Not slow, not failed: nothing. No rejected promise,
 * no error event, no console output. The device waiting on that texture
 * stays behind its placeholder and the progress readout stops partway and
 * never moves again.
 *
 * On the mechanism, only as much as is actually known. An earlier version of
 * this comment said iOS decodes through an img element rather than
 * createImageBitmap, and that is only true below Safari 17: GLTFLoader picks
 * TextureLoader for Safari under 17 and Firefox under 98, and
 * ImageBitmapLoader for everything else. Both paths fail the same way from
 * here, which is a callback that never arrives, so the limit below is the
 * right fix on either branch and nothing depends on knowing which.
 *
 * That was the eighty three percent. It was never a decoder or a transcoder
 * problem, which is worth writing down because an earlier fix went after the
 * Basis transcoder on the theory that it was: sharing one transcoder instead
 * of building ten was a real improvement and could not have been the cause,
 * because these models carry no KTX2 at all. Their textures are webp. The
 * Dell teardown was the clue and it was misread twice: it works not because
 * it is one model rather than ten, but because being one model means its
 * textures decode alone.
 *
 * So the fix is to stop asking for everything at once. Devices mount in a
 * sliding window: a few at first, and each one that finishes lets the next
 * one start. Total bytes are unchanged and the rack still fills in visibly,
 * but the browser is never holding more decodes than it can finish.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

/**
 * How many models may be in flight at once.
 *
 * A coarse pointer is the closest thing to a reliable "this is a phone"
 * signal that does not involve parsing a user agent string, and phones are
 * where this breaks. Four is comfortable on a desktop and two is what a
 * phone on a weak connection can actually finish.
 */
function concurrency(): number {
  if (typeof window === "undefined" || !window.matchMedia) return 3;
  return window.matchMedia("(pointer: coarse)").matches ? 2 : 4;
}

export interface LoadWindow {
  /** How many of the list may render right now. */
  visible: number;
  /** Called by a device once its model has resolved. */
  markReady: (key: string) => void;
  /** How many have finished, for an honest progress readout. */
  ready: number;
}

/**
 * How long to wait on one device before opening the window anyway.
 *
 * Without this the window is a deadlock, which is what the first version of
 * it shipped: if a device never resolves, `ready` never rises, so the window
 * never widens and every device behind it never even starts. That turned a
 * page that used to load most of its models into one that loaded a handful
 * and stopped, which is worse than the problem it was fixing.
 *
 * Eight seconds is longer than a slow model takes on a phone and shorter
 * than a reader will sit looking at an unchanging number.
 */
const STALL_MS = 8000;

export function useLoadWindow(total: number): LoadWindow {
  const limit = useMemo(concurrency, []);
  const done = useRef(new Set<string>());
  const [ready, setReady] = useState(0);
  /* Extra slots granted because something is taking too long. */
  const [grace, setGrace] = useState(0);

  /*
    Keyed by device rather than counted, because a device can re-render for
    reasons that have nothing to do with loading (a selection change, a
    dim toggle) and counting those would open the window early and put us
    back where we started.
  */
  const markReady = useCallback((key: string) => {
    if (done.current.has(key)) return;
    done.current.add(key);
    setReady(done.current.size);
  }, []);

  /*
    Nudge the window open whenever nothing has finished for a while. The
    timer restarts on every completion, so a rack that is merely slow opens
    one extra slot at a time rather than all at once, and a rack with a
    genuinely stuck decode still gets to the end.
  */
  const stalled = ready + grace;
  useEffect(() => {
    if (ready + grace >= total) return;
    const t = window.setTimeout(() => setGrace((g) => g + 1), STALL_MS);
    return () => window.clearTimeout(t);
  }, [stalled, ready, grace, total]);

  return { visible: Math.min(total, ready + grace + limit), markReady, ready };
}
