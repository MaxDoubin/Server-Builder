import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { exportLogEntries, getLogEntries, subscribeToLogEntries } from "@/lib/error-log";

interface DebugOverlayProps {
  visible?: boolean;
}

export function DebugOverlay({ visible = true }: DebugOverlayProps) {
  const [entries, setEntries] = useState(() => getLogEntries());

  useEffect(() => {
    const unsubscribe = subscribeToLogEntries(setEntries);
    // subscribeToLogEntries hands back Set.delete, which returns a boolean, so wrap it:
    // an effect cleanup has to return nothing.
    return () => {
      unsubscribe();
    };
  }, []);

  const summary = useMemo(() => {
    const errors = entries.filter((entry) => entry.level === "error").length;
    const warnings = entries.filter((entry) => entry.level === "warn").length;
    return { errors, warnings };
  }, [entries]);

  if (!visible) return null;

  const handleExport = () => {
    const blob = new Blob([exportLogEntries()], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `hyperscale-debug-${Date.now()}.log`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const recent = entries.slice(0, 3);

  return (
    <div className="rounded-lg border border-white/10 bg-black/60 p-3 text-[10px] text-white/70 shadow-[0_0_20px_rgba(0,0,0,0.4)]">
      <div className="flex items-center justify-between text-[10px] uppercase tracking-widest text-cyan-200">
        <span>Diagnostics</span>
        <span className="text-[9px] text-white/40">
          {summary.errors} errors · {summary.warnings} warnings
        </span>
      </div>
      <div className="mt-2 space-y-1">
        {recent.length === 0 ? (
          <div className="text-white/40">No issues logged.</div>
        ) : (
          recent.map((entry) => (
            <div key={entry.id} className="rounded border border-white/10 bg-black/40 px-2 py-1">
              <div className="flex items-center justify-between">
                <span className="uppercase text-[9px] text-white/40">{entry.level}</span>
                <span className="text-[9px] text-white/30">
                  {new Date(entry.timestamp).toLocaleTimeString()}
                </span>
              </div>
              <div className="text-white/70">{entry.message}</div>
            </div>
          ))
        )}
      </div>
      <Button
        size="sm"
        variant="ghost"
        onClick={handleExport}
        className="mt-2 w-full text-[10px]"
      >
        Export log
      </Button>
    </div>
  );
}
