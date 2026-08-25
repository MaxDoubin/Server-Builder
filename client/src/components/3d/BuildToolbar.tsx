import {
  ClipboardCopy,
  ClipboardPaste,
  Copy,
  Grid3X3,
  Layers,
  MousePointer2,
  Move,
  Redo2,
  RotateCw,
  Trash2,
  Undo2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useBuild } from "@/lib/build-context";
import { useGame } from "@/lib/game-context";

const modeButtons = [
  { id: "select", label: "Select", icon: MousePointer2 },
  { id: "place", label: "Place", icon: Move },
  { id: "rotate", label: "Rotate", icon: RotateCw },
  { id: "delete", label: "Delete", icon: Trash2 },
  { id: "duplicate", label: "Duplicate", icon: Copy },
] as const;

export function BuildToolbar() {
  const {
    mode,
    selectedIds,
    snapEnabled,
    multiSelectEnabled,
    clipboard,
    canUndo,
    canRedo,
    setMode,
    toggleSnap,
    toggleMultiSelect,
    copySelection,
    pasteSelection,
    duplicateSelection,
    deleteSelection,
    undo,
    redo,
  } = useBuild();
  const { deleteRacks, duplicateRacks } = useGame();

  const stop = (e: React.PointerEvent) => e.stopPropagation();

  return (
    <>
      <div
        data-ui="true"
        onPointerDownCapture={stop}
        onPointerMoveCapture={stop}
        className="absolute top-32 left-1/2 z-50 flex w-max max-w-[calc(100%-1.5rem)] -translate-x-1/2 select-none flex-wrap items-center justify-center gap-2 whitespace-nowrap rounded-full border border-cyan-500/30 bg-black/85 px-3 py-2 shadow-[0_0_20px_rgba(34,211,238,0.2)] backdrop-blur"
      >
        {modeButtons.map((button) => {
          const Icon = button.icon;
          return (
            <Button
              key={button.id}
              size="sm"
              variant="ghost"
              onClick={() => setMode(button.id)}
              className={`h-9 rounded-full px-3 text-xs font-mono uppercase tracking-wide ${
                mode === button.id
                  ? "bg-cyan-500/20 text-cyan-100"
                  : "text-white/60 hover:text-white"
              }`}
            >
              <Icon className="mr-2 h-3.5 w-3.5" />
              {button.label}
            </Button>
          );
        })}
        <div className="mx-1 h-6 w-px bg-white/10" />
        <div className="pointer-events-none flex items-center gap-2 text-[10px] font-mono text-white/50">
          <span className="rounded-full bg-white/10 px-2 py-1 uppercase tracking-widest">
            {selectedIds.length} selected
          </span>
          <span className="uppercase tracking-widest">Mode: {mode}</span>
        </div>
      </div>

      <div
        data-ui="true"
        onPointerDownCapture={stop}
        onPointerMoveCapture={stop}
        className="absolute bottom-24 left-1/2 z-50 flex w-max max-w-[calc(100%-1.5rem)] -translate-x-1/2 select-none flex-row flex-wrap justify-center gap-3 rounded-2xl border border-cyan-500/30 bg-black/85 p-2 shadow-[0_0_20px_rgba(34,211,238,0.2)] backdrop-blur"
      >
        <ToolbarButton
          label="Multi"
          icon={Layers}
          active={multiSelectEnabled}
          onClick={toggleMultiSelect}
        />
        <ToolbarButton
          label="Snap"
          icon={Grid3X3}
          active={snapEnabled}
          onClick={toggleSnap}
        />
        <div className="h-6 w-px bg-white/10" />
        <ToolbarButton
          label="Copy"
          icon={ClipboardCopy}
          onClick={copySelection}
          disabled={!selectedIds.length}
        />
        <ToolbarButton
          label="Paste"
          icon={ClipboardPaste}
          onClick={pasteSelection}
          disabled={!clipboard.length}
        />
        <ToolbarButton
          label="Duplicate"
          icon={Copy}
          onClick={() => {
            duplicateRacks(selectedIds);
            duplicateSelection();
          }}
          disabled={!selectedIds.length}
        />
        <ToolbarButton
          label="Delete"
          icon={Trash2}
          onClick={() => {
            deleteRacks(selectedIds);
            deleteSelection();
          }}
          disabled={!selectedIds.length}
        />
        <div className="h-6 w-px bg-white/10" />
        <ToolbarButton label="Undo" icon={Undo2} onClick={undo} disabled={!canUndo} />
        <ToolbarButton label="Redo" icon={Redo2} onClick={redo} disabled={!canRedo} />
      </div>
    </>
  );
}

function ToolbarButton({
  label,
  icon: Icon,
  active,
  onClick,
  disabled,
}: {
  label: string;
  icon: typeof ClipboardCopy;
  active?: boolean;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <Button
      size="icon"
      variant="ghost"
      onClick={onClick}
      disabled={disabled}
      className={`h-10 w-10 rounded-xl text-white/70 hover:text-white ${
        active ? "bg-cyan-500/20 text-cyan-200" : ""
      }`}
      aria-label={label}
      title={label}
    >
      <Icon className="h-4 w-4" />
    </Button>
  );
}
