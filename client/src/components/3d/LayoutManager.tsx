/**
 * Named layouts in localStorage, and the share link.
 *
 * Overwrite and delete both ask first, inline rather than through
 * window.confirm, so the question appears in the panel the user is already
 * looking at and can be dismissed with the keyboard.
 */

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/ui/copy-button";
import {
  deleteNamedLayout,
  listNamedLayouts,
  loadNamedLayout,
  MAX_LAYOUT_NAME_LENGTH,
  MAX_NAMED_LAYOUTS,
  renameNamedLayout,
  saveNamedLayout,
  type NamedLayoutSummary,
} from "@/lib/save-system";
import { encodeLayout, MAX_HASH_LENGTH, shareUrlForHash } from "@/lib/shareLink";
import type { Equipment, Rack } from "@shared/schema";

type Message = { kind: "ok" | "error"; text: string } | null;

type ShareState =
  | { status: "idle" }
  | { status: "ready"; url: string; length: number; deltaCount: number; note?: string }
  | { status: "error"; reason: string };

const timestamp = (value: number) => {
  if (!value) return "unknown date";
  try {
    return new Date(value).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "unknown date";
  }
};

interface LayoutManagerProps {
  /** The whole pool, not the visible slice: a save should not lose racks. */
  racks: Rack[];
  visibleCount: number;
  catalog: Equipment[];
  onLoad: (racks: Rack[], visibleCount: number) => void;
  onShareCopied: () => void;
}

export function LayoutManager({
  racks,
  visibleCount,
  catalog,
  onLoad,
  onShareCopied,
}: LayoutManagerProps) {
  const [layouts, setLayouts] = useState<NamedLayoutSummary[]>([]);
  const [name, setName] = useState("");
  const [message, setMessage] = useState<Message>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [confirmOverwrite, setConfirmOverwrite] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [share, setShare] = useState<ShareState>({ status: "idle" });

  const refresh = useCallback(() => setLayouts(listNamedLayouts()), []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const clearConfirms = () => {
    setConfirmDelete(null);
    setConfirmOverwrite(null);
  };

  const handleSaveNew = () => {
    clearConfirms();
    const result = saveNamedLayout(name, racks);
    if (!result.ok) {
      setMessage({ kind: "error", text: result.error ?? "The layout could not be saved." });
      return;
    }
    setName("");
    refresh();
    setMessage({
      kind: "ok",
      text: `Saved "${result.layout?.name}" with ${result.layout?.rackCount.toLocaleString()} racks.`,
    });
  };

  const handleOverwrite = (layout: NamedLayoutSummary) => {
    const result = saveNamedLayout(layout.name, racks, layout.id);
    clearConfirms();
    if (!result.ok) {
      setMessage({ kind: "error", text: result.error ?? "The layout could not be replaced." });
      return;
    }
    refresh();
    setMessage({ kind: "ok", text: `Replaced "${layout.name}".` });
  };

  const handleDelete = (layout: NamedLayoutSummary) => {
    const result = deleteNamedLayout(layout.id);
    clearConfirms();
    if (!result.ok) {
      setMessage({ kind: "error", text: result.error ?? "The layout could not be deleted." });
      return;
    }
    refresh();
    setMessage({ kind: "ok", text: `Deleted "${layout.name}".` });
  };

  const handleLoad = (layout: NamedLayoutSummary) => {
    clearConfirms();
    const full = loadNamedLayout(layout.id);
    if (!full) {
      setMessage({ kind: "error", text: "That layout is no longer in storage." });
      refresh();
      return;
    }
    onLoad(full.racks, Math.min(full.racks.length, Math.max(1, visibleCount)));
    setMessage({
      kind: "ok",
      text: `Loaded "${full.name}", ${full.rackCount.toLocaleString()} racks.`,
    });
  };

  const handleRename = (layout: NamedLayoutSummary) => {
    const result = renameNamedLayout(layout.id, renameValue);
    if (!result.ok) {
      setMessage({ kind: "error", text: result.error ?? "The layout could not be renamed." });
      return;
    }
    setRenamingId(null);
    setRenameValue("");
    refresh();
    setMessage({ kind: "ok", text: `Renamed to "${result.layout?.name}".` });
  };

  /*
    Built on demand rather than on every render. Encoding regenerates the
    500 rack baseline to diff against, which is not something to do while
    somebody is dragging the density slider.
  */
  const handleBuildShareLink = () => {
    const result = encodeLayout(racks, visibleCount, catalog);
    if (!result.ok || !result.hash) {
      setShare({
        status: "error",
        reason: result.reason ?? "This layout cannot be encoded into a link.",
      });
      return;
    }
    setShare({
      status: "ready",
      url: shareUrlForHash(result.hash),
      length: result.length,
      deltaCount: result.deltaCount,
      note: result.reason,
    });
  };

  return (
    <div className="space-y-3">
      <section className="space-y-2">
        <label
          className="block text-[10px] uppercase tracking-widest text-white/50"
          htmlFor="layout-name"
        >
          Save the current floor
        </label>
        <div className="flex gap-2">
          <input
            id="layout-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={MAX_LAYOUT_NAME_LENGTH}
            placeholder="Layout name"
            className="min-w-0 flex-1 rounded-md border border-white/15 bg-black/50 px-2 py-1.5 text-[11px] text-white placeholder:text-white/50 focus:border-cyan-400/60 focus:outline-none"
          />
          <Button
            size="sm"
            variant="secondary"
            className="shrink-0 bg-white/10 text-[10px] uppercase tracking-widest text-white hover:bg-white/20"
            onClick={handleSaveNew}
            disabled={!name.trim()}
          >
            Save
          </Button>
        </div>
        <p className="text-[10px] text-white/50">
          {racks.length.toLocaleString()} racks in this build. Room for {MAX_NAMED_LAYOUTS} named
          layouts.
        </p>
      </section>

      {message && (
        <p
          role={message.kind === "error" ? "alert" : "status"}
          className={`rounded-md border px-2 py-1.5 text-[10px] leading-relaxed ${
            message.kind === "error"
              ? "border-rose-500/50 bg-rose-500/10 text-rose-100"
              : "border-emerald-400/40 bg-emerald-400/10 text-emerald-100"
          }`}
        >
          {message.text}
        </p>
      )}

      <section className="space-y-1.5">
        <div className="text-[10px] uppercase tracking-widest text-white/50">Saved layouts</div>
        {layouts.length === 0 ? (
          <p className="text-[10px] text-white/50">Nothing saved yet.</p>
        ) : (
          <ul className="space-y-1.5">
            {layouts.map((layout) => (
              <li key={layout.id} className="rounded-md border border-white/10 bg-white/5 p-2">
                {renamingId === layout.id ? (
                  <div className="flex gap-1.5">
                    <input
                      value={renameValue}
                      onChange={(event) => setRenameValue(event.target.value)}
                      maxLength={MAX_LAYOUT_NAME_LENGTH}
                      aria-label={`New name for ${layout.name}`}
                      className="min-w-0 flex-1 rounded-md border border-white/15 bg-black/50 px-2 py-1 text-[11px] text-white focus:border-cyan-400/60 focus:outline-none"
                    />
                    <Button
                      size="sm"
                      variant="secondary"
                      className="h-7 shrink-0 bg-white/10 px-2 text-[10px] uppercase text-white hover:bg-white/20"
                      onClick={() => handleRename(layout)}
                    >
                      Save
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 shrink-0 px-2 text-[10px] uppercase text-white/60"
                      onClick={() => setRenamingId(null)}
                    >
                      Cancel
                    </Button>
                  </div>
                ) : (
                  <>
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-[11px] font-medium text-white/90">
                        {layout.name}
                      </span>
                      <span className="shrink-0 font-mono text-[9px] text-white/50">
                        {layout.rackCount.toLocaleString()} racks
                      </span>
                    </div>
                    <div className="text-[9px] text-white/50">
                      {timestamp(layout.savedAt)} · {layout.equipmentCount.toLocaleString()} items
                    </div>

                    {confirmDelete === layout.id ? (
                      <div className="mt-1.5 rounded-md border border-rose-500/50 bg-rose-500/10 p-1.5">
                        <p className="text-[10px] text-rose-100">
                          Delete "{layout.name}" permanently?
                        </p>
                        <div className="mt-1 flex gap-1.5">
                          <Button
                            size="sm"
                            variant="secondary"
                            className="h-7 bg-rose-500/30 px-2 text-[10px] uppercase text-rose-50 hover:bg-rose-500/50"
                            onClick={() => handleDelete(layout)}
                          >
                            Delete
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2 text-[10px] uppercase text-white/60"
                            onClick={() => setConfirmDelete(null)}
                          >
                            Keep
                          </Button>
                        </div>
                      </div>
                    ) : confirmOverwrite === layout.id ? (
                      <div className="mt-1.5 rounded-md border border-amber-400/50 bg-amber-400/10 p-1.5">
                        <p className="text-[10px] text-amber-100">
                          Replace "{layout.name}" with the current floor?
                        </p>
                        <div className="mt-1 flex gap-1.5">
                          <Button
                            size="sm"
                            variant="secondary"
                            className="h-7 bg-amber-400/25 px-2 text-[10px] uppercase text-amber-50 hover:bg-amber-400/40"
                            onClick={() => handleOverwrite(layout)}
                          >
                            Replace
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2 text-[10px] uppercase text-white/60"
                            onClick={() => setConfirmOverwrite(null)}
                          >
                            Cancel
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        <Button
                          size="sm"
                          variant="secondary"
                          className="h-7 bg-white/10 px-2 text-[10px] uppercase text-white hover:bg-white/20"
                          onClick={() => handleLoad(layout)}
                        >
                          Load
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 text-[10px] uppercase text-white/60 hover:text-white"
                          onClick={() => {
                            clearConfirms();
                            setRenamingId(layout.id);
                            setRenameValue(layout.name);
                          }}
                        >
                          Rename
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 text-[10px] uppercase text-white/60 hover:text-white"
                          onClick={() => {
                            setConfirmDelete(null);
                            setConfirmOverwrite(layout.id);
                          }}
                        >
                          Overwrite
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 text-[10px] uppercase text-rose-300/80 hover:text-rose-200"
                          onClick={() => {
                            setConfirmOverwrite(null);
                            setConfirmDelete(layout.id);
                          }}
                        >
                          Delete
                        </Button>
                      </div>
                    )}
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-2 border-t border-white/10 pt-2.5">
        <div className="text-[10px] uppercase tracking-widest text-white/50">Share by link</div>
        <p className="text-[10px] leading-relaxed text-white/50">
          The link carries the generator seed, the rack count and a list of the racks you changed,
          not a copy of the floor. Opening it rebuilds the same layout.
        </p>
        <Button
          size="sm"
          variant="secondary"
          className="bg-white/10 text-[10px] uppercase tracking-widest text-white hover:bg-white/20"
          onClick={handleBuildShareLink}
        >
          Build share link
        </Button>

        {share.status === "ready" && (
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              {/*
                The capture handler sits on a wrapper rather than inside the
                button so it also fires for a keyboard activation, where the
                click event's target is the button itself.
              */}
              <span onClickCapture={onShareCopied}>
                <CopyButton
                  value={share.url}
                  label="Copy share link"
                  className="border-white/20 text-white/70 hover:border-cyan-400/60 hover:text-white"
                  testId="copy-share-link"
                >
                  <span>Copy share link</span>
                </CopyButton>
              </span>
              <span className="font-mono text-[9px] text-white/50">
                {share.length} of {MAX_HASH_LENGTH} chars
              </span>
            </div>
            <p className="break-all rounded-md border border-white/10 bg-black/40 px-2 py-1 font-mono text-[9px] text-white/50">
              {share.url}
            </p>
            <p className="text-[10px] text-white/50">
              {share.deltaCount === 0
                ? "Nothing differs from the generated floor, so the link is just the recipe."
                : `${share.deltaCount.toLocaleString()} rack${
                    share.deltaCount === 1 ? "" : "s"
                  } differ from the generated floor and are spelled out in the link.`}
            </p>
            {share.note && <p className="text-[10px] text-amber-200">{share.note}</p>}
          </div>
        )}

        {share.status === "error" && (
          <p
            role="alert"
            className="rounded-md border border-rose-500/50 bg-rose-500/10 px-2 py-1.5 text-[10px] leading-relaxed text-rose-100"
          >
            {share.reason}
          </p>
        )}
      </section>
    </div>
  );
}
