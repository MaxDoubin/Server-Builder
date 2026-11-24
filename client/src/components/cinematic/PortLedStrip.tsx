import { useEffect, useRef } from "react";
import { useHeavySceneAllowed } from "@/lib/motion/useHeavySceneAllowed";

/*
  A strip of switch port LEDs, drawn in one small 2D canvas.

  What it depicts, so it stays honest: the faceplate of an access switch seen
  from far enough away that only the LEDs read. Ports sit in two rows and in
  blocks of twelve (six columns), the way a 24 or 48 port faceplate groups
  them. Each port has one LED with the usual three meanings:

    dark          no link
    steady        link up, idle
    brief dip     traffic on the link

  A minority of linked ports are amber rather than green, which on most
  access switches marks a link that negotiated below the port's top speed.
  It carries traffic like any other, so it dips the same way.

  Why a canvas and not two hundred elements: the strip is decoration at the
  bottom of every page, and its whole budget is "nobody can measure it". One
  element, no layout work, and only the LEDs whose brightness changed since
  the last tick are repainted, which on a typical tick is a handful.

  The pattern is a pure function of (seed, port, time). There is no
  Math.random and no per-LED state to drift, so the still frame is identical
  on every render and the moving one needs no allocation after layout.

  Theming: the three colors come from CSS custom properties read off the
  canvas, so the strip follows the light and dark palettes and can be
  restyled from a stylesheet without touching this file.

    --port-led-on     linked, full speed    default hsl(var(--brand-signal))
    --port-led-warn   linked, lower speed   default hsl(var(--brand-amber))
    --port-led-off    unlit LED housing     default hsl(var(--brand-iron))
*/

const SEED = 0x51ed;

/* Geometry, in CSS pixels. The parent sets the height; 16px fits two rows. */
const LED_W = 5;
const LED_H = 4;
const PITCH = 10;
const ROW_Y = [2, 10];
const BLOCK_COLS = 6;
const BLOCK_GAP = 7;
/* One 48 port faceplate at most. A wall of them across a wide footer is loud. */
const MAX_COLS = 24;
/* How far the soft halo reaches past the LED. A cell is the LED plus this. */
const HALO = 2;

/*
  One traffic dip takes a whole slot, and a port gets at most one per slot,
  so no LED can cycle faster than 2 Hz. That is the ceiling WCAG 2.3.1 work
  wants for small indicators, and real activity LEDs that blink at 10 Hz or
  more are exactly the thing not to reproduce on a page somebody is reading.
*/
const SLOT_MS = 500;
/* Repaint cadence. A dip is a smooth curve, so five steps of it is enough. */
const TICK_MS = 100;
/* Ports come up over this long on first sight, each at its own moment. */
const LINK_UP_MS = 1600;
const LEVELS = 15;

const UNLINKED = 0;
const GREEN = 1;
const AMBER = 2;

/** Integer hash of (port, salt) to a float in [0, 1). Stateless on purpose. */
function hash(port: number, salt: number): number {
  let h =
    Math.imul(port ^ SEED, 0x9e3779b1) ^ Math.imul(salt + 0x7f4a7c15, 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
}

/** Brightness of a linked port at a moment, 0 to 1. */
function brightness(port: number, ms: number): number {
  // Each port links at its own moment, then stays up. One fade, not a flash.
  const up = (ms - hash(port, 4) * LINK_UP_MS) / 300;
  if (up <= 0) return 0;

  // A private phase per port, so no two ports dip in step and the strip
  // never pulses as a block.
  const t = ms / SLOT_MS + hash(port, 3);
  const slot = Math.floor(t);

  // Most ports are quiet and a few are busy: cubing skews the spread. Traffic
  // also comes in bursts, so a port is only chatty during some 4 s windows.
  const busy = hash(port, 2);
  const bursting = hash(port, 1000 + (slot >> 3)) < 0.4;
  const chance = (0.02 + 0.6 * busy * busy * busy) * (bursting ? 1 : 0.08);

  let level = 1;
  if (hash(port, 2000 + slot) < chance) {
    const s = Math.sin(Math.PI * (t - slot));
    level = 1 - 0.8 * s * s;
  }
  return up < 1 ? level * up : level;
}

export default function PortLedStrip() {
  const ref = useRef<HTMLCanvasElement>(null);
  // False for prefers-reduced-motion, Save-Data and 2g: those get the still
  // frame, every linked port steady, and no timer is ever started.
  const animate = useHeavySceneAllowed();

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    let roles = new Uint8Array(0);
    let painted = new Uint8Array(0);
    let originX = 0;
    let colors = ["", "", ""];
    let elapsed = 0;
    let lastTick = 0;
    let timer = 0;
    let onScreen = false;

    const paint = () => {
      for (let port = 0; port < roles.length; port += 1) {
        const role = roles[port];
        const level =
          role === UNLINKED
            ? 0
            : animate
              ? Math.round(brightness(port, elapsed) * LEVELS)
              : LEVELS;
        if (painted[port] === level) continue;
        painted[port] = level;

        const col = port >> 1;
        const x = originX + col * PITCH + Math.floor(col / BLOCK_COLS) * BLOCK_GAP;
        const y = ROW_Y[port & 1];
        const lit = level / LEVELS;

        ctx.clearRect(x - HALO, y - HALO, LED_W + 2 * HALO, LED_H + 2 * HALO);
        ctx.globalAlpha = 1;
        ctx.fillStyle = colors[UNLINKED];
        ctx.fillRect(x, y, LED_W, LED_H);
        if (level === 0) continue;
        ctx.fillStyle = colors[role];
        ctx.globalAlpha = 0.14 * lit;
        ctx.fillRect(x - HALO, y - HALO, LED_W + 2 * HALO, LED_H + 2 * HALO);
        ctx.globalAlpha = lit;
        ctx.fillRect(x, y, LED_W, LED_H);
      }
    };

    /** Forget what is on the canvas, so the next paint redraws every LED. */
    const repaintAll = () => {
      const style = getComputedStyle(canvas);
      const pick = (name: string, token: string) =>
        style.getPropertyValue(name).trim() ||
        `hsl(${style.getPropertyValue(token).trim()})`;
      colors = [
        pick("--port-led-off", "--brand-iron"),
        pick("--port-led-on", "--brand-signal"),
        pick("--port-led-warn", "--brand-amber"),
      ];
      ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);
      painted.fill(255);
      paint();
    };

    const layout = () => {
      const width = canvas.clientWidth;
      // Capped at 2: a 3x phone gains nothing visible from 9x the pixels.
      const scale = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * scale);
      canvas.height = Math.round(canvas.clientHeight * scale);
      ctx.setTransform(scale, 0, 0, scale, 0, 0);

      // As many whole columns as fit up to the cap, flush right, halo included.
      let cols = 0;
      let used = 0;
      for (;;) {
        const next =
          cols * PITCH + Math.floor(cols / BLOCK_COLS) * BLOCK_GAP + LED_W + 2 * HALO;
        if (next > width || cols === MAX_COLS) break;
        used = next;
        cols += 1;
      }
      originX = width - used + HALO;

      roles = new Uint8Array(cols * 2);
      painted = new Uint8Array(cols * 2);
      for (let port = 0; port < roles.length; port += 1) {
        const r = hash(port, 1);
        roles[port] = r < 0.16 ? UNLINKED : r < 0.27 ? AMBER : GREEN;
      }
      repaintAll();
    };

    const tick = () => {
      const now = performance.now();
      // Clamped, so a throttled timer cannot skip the pattern ahead.
      elapsed += Math.min(now - lastTick, 4 * TICK_MS);
      lastTick = now;
      paint();
    };

    /** Run only while the strip is on screen in a visible tab. */
    const sync = () => {
      const run = animate && onScreen && !document.hidden;
      if (run && !timer) {
        lastTick = performance.now();
        timer = window.setInterval(tick, TICK_MS);
      } else if (!run && timer) {
        window.clearInterval(timer);
        timer = 0;
      }
    };

    const resize = new ResizeObserver(layout);
    resize.observe(canvas);
    const view = new IntersectionObserver(([entry]) => {
      onScreen = entry.isIntersecting;
      sync();
    });
    view.observe(canvas);
    // The theme is a class on <html>; the tokens change under it.
    const theme = new MutationObserver(repaintAll);
    theme.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });
    document.addEventListener("visibilitychange", sync);

    return () => {
      window.clearInterval(timer);
      resize.disconnect();
      view.disconnect();
      theme.disconnect();
      document.removeEventListener("visibilitychange", sync);
    };
  }, [animate]);

  return <canvas ref={ref} aria-hidden className="block h-full w-full" />;
}
