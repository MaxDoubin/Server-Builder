/**
 * An animated diagram of ECMP on a leaf-spine fabric.
 *
 * Canvas2D on purpose. The site's other moving pictures are three.js, which
 * is the right tool for a rack and 800 KB too many for a diagram of lines
 * and dots in the middle of an article. This is a few KB and one canvas.
 *
 * The contract with the page:
 *
 *   - It only animates while it can be seen. An IntersectionObserver and
 *     the Page Visibility API both gate the frame loop, and a reader can
 *     pause it, since it runs for longer than five seconds beside text.
 *   - With prefers-reduced-motion, or Save-Data or a 2g connection, there is
 *     no loop at all: one still frame with every flow drawn as a line along
 *     its path, and a caption that says in words what the motion would have.
 *   - The canvas is a picture, so it carries role="img" and a full text
 *     alternative. The only keyboard stop is the pause button.
 *
 * The forwarding logic lives in ecmp.ts and the drawing in fabric.ts.
 */

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useDeviceTier } from "@/lib/motion/useDeviceTier";
import { useHeavySceneAllowed } from "@/lib/motion/useHeavySceneAllowed";
import { formatIp } from "./ecmp";
import { createFabric, type FabricStatus } from "./fabric";

export interface SpineLeafFlowsProps {
  /** Spine switches, 2 to 6. Four shows the spread without crowding. */
  spines?: number;
  /** Leaf switches, 3 to 8. */
  leaves?: number;
  /** Widest the figure may grow: a px number or any CSS length. */
  maxWidth?: number | string;
  /**
   * Width divided by height. Left out, it is wide on a desktop column and
   * closer to square on a phone, where a wide strip would be too short to
   * tell the links apart.
   */
  aspect?: number;
  /** Hide the explanatory text when the surrounding page already has it. */
  showCaption?: boolean;
  className?: string;
}

const ALT =
  "Diagram of a leaf-spine network. Every leaf switch on the bottom row has one link to every spine switch on the top row. " +
  "Many small flows travel leaf to spine to leaf, and a hash of each flow's header fields decides which spine it uses, so the flows spread across all the spines. " +
  "One large flow stays on a single spine because all of its packets hash the same way. " +
  "When the link carrying the large flow fails, the flows that used it are hashed again onto the remaining spines, and they return when the link is restored.";

function clampInt(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(value)));
}

function describe(status: FabricStatus | null, still: boolean): string {
  if (!status) return "";
  const spine = `S${status.failSpine + 1}`;
  const leaf = `L${status.failLeaf + 1}`;
  if (still) {
    return (
      "Each line is one flow, drawn leaf to spine to leaf in the color of the spine its hash picked. " +
      `The thick line is one large flow. All of its packets hash the same way, so it stays on ${spine} however busy that link gets, ` +
      "and the bar above each spine shows that spine's share of the traffic. " +
      "If a link fails, the flows whose next-hop set contained it are hashed again over the spines that remain."
    );
  }
  if (status.phase === "down") {
    const extra =
      status.collateral > 0
        ? ` ${status.collateral} of them were on links that never failed: removing a next hop resizes every hash region.`
        : "";
    return (
      `Link ${leaf} to ${spine} is down. ${leaf} drops ${spine} from its next-hop set, and the other leaves stop using ${spine} to reach ${leaf}. ` +
      `${status.moved} flows were hashed again onto the remaining spines.${extra}`
    );
  }
  if (status.phase === "restored") {
    return (
      `Link restored. ${spine} is a next hop again, the hash regions return to where they were, ` +
      `and ${status.moved} flows move back, the large one among them.`
    );
  }
  return (
    "Each flow's header fields are hashed once, and the result picks one spine. " +
    `Every packet of a flow follows the same path, so the large flow stays on ${spine} while the small ones spread out. ` +
    "The bar above each spine is its share of the traffic."
  );
}

export function SpineLeafFlows({
  spines = 4,
  leaves = 5,
  maxWidth = 760,
  aspect,
  showCaption = true,
  className,
}: SpineLeafFlowsProps) {
  const spineCount = clampInt(spines, 2, 6);
  const leafCount = clampInt(leaves, 3, 8);

  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const motionAllowed = useHeavySceneAllowed();
  const { tier, mobile } = useDeviceTier();
  const [paused, setPaused] = useState(false);
  // Pausing must not rebuild the simulation, so the loop reads it from a ref
  // and is nudged through syncRef instead of being an effect dependency.
  const pausedRef = useRef(false);
  const syncRef = useRef<() => void>(() => {});
  const [status, setStatus] = useState<FabricStatus | null>(null);

  // Fewer flows where frames are scarce or the canvas is small.
  const mice = tier === "low" ? 12 : mobile ? 18 : 28;

  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!wrap || !canvas || !ctx) return;

    const fabric = createFabric(ctx, {
      spines: spineCount,
      leaves: leafCount,
      mice,
      onStatus: setStatus,
    });

    let frame = 0;
    let last = 0;
    let onScreen = false;
    let sized = false;

    const tick = (now: number) => {
      // Clamp the step so a resume after a long pause does not jump ahead.
      const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
      last = now;
      fabric.step(dt);
      fabric.draw();
      frame = requestAnimationFrame(tick);
    };

    const stop = () => {
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      canvas.dataset.running = "false";
    };

    /** Start or stop the loop to match everything that gates it. */
    const sync = () => {
      const run = motionAllowed && !pausedRef.current && onScreen && sized && !document.hidden;
      if (run && !frame) {
        last = performance.now();
        canvas.dataset.running = "true";
        frame = requestAnimationFrame(tick);
      } else if (!run) {
        stop();
      }
    };

    const layout = () => {
      const width = wrap.clientWidth;
      if (width <= 0) return;
      const ratio = aspect ?? (width < 520 ? 1.15 : 1.9);
      const height = Math.round(width / ratio);
      // Sharp on a phone, but never more than four pixels per CSS pixel.
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.style.height = `${height}px`;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      // Labels follow the reader's text size, not a fixed pixel count.
      const rootPx = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
      const family = getComputedStyle(canvas).fontFamily || "monospace";
      fabric.resize(width, height, dpr, `${Math.round(rootPx * 0.6875)}px ${family}`);
      sized = true;
      // A resize clears the canvas, so repaint now instead of waiting.
      if (motionAllowed) fabric.draw();
      else fabric.drawStatic();
      sync();
    };

    const resizeObserver = new ResizeObserver(layout);
    resizeObserver.observe(wrap);
    layout();
    syncRef.current = sync;

    const viewObserver = new IntersectionObserver(
      (entries) => {
        onScreen = entries[entries.length - 1]?.isIntersecting ?? false;
        sync();
      },
      { rootMargin: "80px" },
    );
    viewObserver.observe(canvas);
    document.addEventListener("visibilitychange", sync);

    return () => {
      stop();
      resizeObserver.disconnect();
      viewObserver.disconnect();
      document.removeEventListener("visibilitychange", sync);
      fabric.destroy();
      syncRef.current = () => {};
    };
  }, [spineCount, leafCount, mice, aspect, motionAllowed]);

  useEffect(() => {
    pausedRef.current = paused;
    syncRef.current();
  }, [paused]);

  const style: CSSProperties = {
    maxWidth: typeof maxWidth === "number" ? `${maxWidth}px` : maxWidth,
  };
  const elephant = status?.elephant;

  return (
    <figure
      className={`mx-auto w-full ${className ?? ""}`}
      style={style}
      data-testid="spine-leaf-flows"
    >
      {/*
        The panel paints its own dark ground in both themes, the way the
        rack scene does: glowing packets are drawn additively and only read
        against black.
      */}
      <div
        ref={wrapRef}
        className="overflow-hidden rounded-md border border-[hsl(var(--brand-iron))]"
        style={{
          background:
            "radial-gradient(120% 90% at 50% 0%, hsl(220 14% 9%) 0%, hsl(220 14% 3%) 70%)",
        }}
      >
        <canvas
          ref={canvasRef}
          role="img"
          aria-label={ALT}
          className="block w-full font-mono-tight"
        />
      </div>

      {showCaption && (
        <figcaption className="mt-3 space-y-2 text-[0.8125rem] leading-relaxed text-[hsl(var(--brand-bone-dim))]">
          <div className="flex items-start justify-between gap-4">
            <span className="font-mono-tight text-[0.625rem] uppercase tracking-[0.3em] text-[hsl(var(--brand-ash))]">
              ECMP on a leaf-spine fabric
            </span>
            {motionAllowed && (
              <button
                type="button"
                onClick={() => setPaused((p) => !p)}
                aria-pressed={paused}
                className="shrink-0 rounded border border-[hsl(var(--brand-iron))] px-3 py-1 font-mono-tight text-[0.625rem] uppercase tracking-[0.2em] text-[hsl(var(--brand-bone-dim))] transition-colors hover:text-[hsl(var(--brand-bone))]"
                data-testid="spine-leaf-pause"
              >
                {paused ? "Play" : "Pause"}
              </button>
            )}
          </div>
          {/* Sized for the longest phase so the article below does not jump. */}
          <span className="block min-h-[6.5em] sm:min-h-[4.9em]">
            {describe(status, !motionAllowed)}
          </span>
          {elephant && (
            <span className="block font-mono-tight text-[0.6875rem] text-[hsl(var(--brand-ash))]">
              large flow: {formatIp(elephant.srcIp)}:{elephant.srcPort} to{" "}
              {formatIp(elephant.dstIp)}:{elephant.dstPort} tcp, hash key 0x
              {elephant.key.toString(16).padStart(4, "0")}, via S{elephant.spine + 1}
            </span>
          )}
        </figcaption>
      )}
    </figure>
  );
}

export default SpineLeafFlows;
