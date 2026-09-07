/**
 * The keyboard reference, opened with ?.
 *
 * Every entry below is a key the scene actually handles. The list is read
 * from the real handlers in datacenter-3d and EquipmentPicker rather than
 * invented, because a shortcut sheet that lies is worse than none.
 *
 * A real dialog: focus moves in on open, Tab is kept inside while it is up,
 * Escape closes it, and focus goes back where it came from. It is absolutely
 * positioned inside the scene box like the rest of the overlays, so an
 * embedded scene does not throw a panel across the whole page.
 */

import { useEffect, useRef } from "react";

interface ShortcutGroup {
  title: string;
  items: Array<{ keys: string[]; description: string }>;
}

const GROUPS: ShortcutGroup[] = [
  {
    title: "Camera",
    items: [
      { keys: ["1"], description: "Orbit camera, the one you drag" },
      { keys: ["2"], description: "Slow automatic orbit" },
      { keys: ["3"], description: "Cinematic flythrough" },
    ],
  },
  {
    title: "Display",
    items: [
      { keys: ["H"], description: "Holographic HUD in the scene" },
      { keys: ["E"], description: "Atmospheric effects: dust, shimmer, volumetrics" },
      { keys: ["O"], description: "All screen overlays" },
      { keys: ["T"], description: "Build toolbars" },
      { keys: ["G"], description: "Focus mode, which hides the overlays and toolbars together" },
      { keys: ["F"], description: "Frame rate and performance readout" },
    ],
  },
  {
    title: "Editing",
    items: [
      { keys: ["Ctrl", "Z"], description: "Undo the last selection or mode change" },
      { keys: ["Ctrl", "Shift", "Z"], description: "Redo" },
      { keys: ["1", "to", "9"], description: "In the equipment picker, install the numbered result" },
    ],
  },
  {
    title: "This panel",
    items: [
      { keys: ["?"], description: "Open this list" },
      { keys: ["Esc"], description: "Close it" },
    ],
  },
  {
    title: "Pointer",
    items: [
      { keys: ["Drag"], description: "Rotate the camera" },
      { keys: ["Scroll"], description: "Zoom" },
      { keys: ["Right drag"], description: "Pan" },
      { keys: ["Click"], description: "Select a rack and open its panel" },
    ],
  },
];

const FOCUSABLE =
  'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

export function ShortcutsDialog({
  open,
  onClose,
  compatibilityMode = false,
}: {
  open: boolean;
  onClose: () => void;
  /** The reduced profile pins the camera to orbit, so 2 and 3 do nothing. */
  compatibilityMode?: boolean;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const returnFocusTo = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    returnFocusTo.current = document.activeElement as HTMLElement | null;
    // Focus the close control rather than the container: it is the safe
    // action, and it puts Tab at the top of the panel's own order.
    closeRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const panel = panelRef.current;
      if (!panel) return;
      const focusable = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (element) => !element.hasAttribute("disabled"),
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && (active === first || !panel.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener("keydown", handleKeyDown, true);
    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
      returnFocusTo.current?.focus?.();
    };
  }, [onClose, open]);

  if (!open) return null;

  return (
    <div className="absolute inset-0 z-[120] flex items-center justify-center p-4" data-ui="true">
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="shortcuts-title"
        className="relative max-h-full w-full max-w-[560px] overflow-y-auto rounded-2xl border border-cyan-500/30 bg-black/95 p-4 shadow-[0_0_40px_rgba(34,211,238,0.25)]"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-[10px] uppercase tracking-[0.3em] text-cyan-300/80">
              Keyboard
            </div>
            <h2 id="shortcuts-title" className="text-lg font-semibold text-white">
              Scene shortcuts
            </h2>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/15 text-white/70 hover:bg-white/10 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400"
            aria-label="Close keyboard shortcuts"
          >
            <span aria-hidden>×</span>
          </button>
        </div>

        <p className="mt-2 text-[11px] leading-relaxed text-white/50">
          Shortcuts are ignored while you are typing in a field, and while the entry screen is up.
          {compatibilityMode
            ? " This device is on the compatibility renderer, so 2 and 3 stay on the orbit camera."
            : ""}
        </p>

        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {GROUPS.map((group) => (
            <section key={group.title}>
              <h3 className="text-[10px] uppercase tracking-[0.24em] text-white/50">
                {group.title}
              </h3>
              <dl className="mt-1.5 space-y-1.5">
                {group.items.map((item) => (
                  <div key={item.description} className="flex items-baseline gap-2">
                    <dt className="flex shrink-0 items-center gap-1">
                      {item.keys.map((key) => (
                        <kbd
                          key={key}
                          className="rounded border border-white/20 bg-white/10 px-1.5 py-0.5 font-mono text-[10px] text-white/80"
                        >
                          {key}
                        </kbd>
                      ))}
                    </dt>
                    <dd className="text-[11px] leading-snug text-white/60">{item.description}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
