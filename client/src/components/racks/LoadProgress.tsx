/**
 * What the models are doing, said out loud.
 *
 * These pages fetch between four and fifty megabytes of geometry, and until
 * this existed they said nothing about it. A reader on a real connection got
 * a dark rectangle with no spinner and no percentage, which is
 * indistinguishable from a broken page, and they are right to close the tab.
 *
 * Sits over the canvas rather than inside it, so it is ordinary DOM that
 * renders before any WebGL context exists and cannot itself be waiting on
 * the thing it is reporting.
 */

import { useProgress } from "@react-three/drei";

export function LoadProgress({ label = "models" }: { label?: string }) {
  const { active, progress, loaded, total } = useProgress();
  if (!active) return null;

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex items-center gap-3 bg-[hsl(var(--brand-void)/0.86)] px-4 py-2.5 backdrop-blur-sm">
      <div className="h-[3px] flex-1 overflow-hidden rounded bg-[hsl(var(--brand-iron))]">
        <div
          className="h-full rounded bg-[hsl(var(--brand-signal))] transition-[width] duration-200"
          style={{ width: `${Math.max(4, Math.round(progress))}%` }}
        />
      </div>
      <span className="shrink-0 font-mono-tight text-[10px] tabular-nums text-[hsl(var(--brand-bone-dim))]">
        {loaded} of {total || "?"} {label} · {Math.round(progress)}%
      </span>
    </div>
  );
}
