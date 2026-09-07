import { useEffect, useRef, useState } from "react";
import { Html } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";

export type QualityMode = "low" | "high";

interface PerformanceOverlayProps {
  visible?: boolean;
  qualityMode?: QualityMode;
  onQualityChange?: (quality: QualityMode, reason: string) => void;
  onWarningChange?: (warning: string | null) => void;
  positionClassName?: string;
}

export function PerformanceOverlay({
  visible = false,
  qualityMode = "high",
  onQualityChange,
  onWarningChange,
  positionClassName = "fixed top-6 right-6",
}: PerformanceOverlayProps) {
  const [stats, setStats] = useState({ fps: 0, frameMs: 0 });
  const accRef = useRef({ t: 0, frames: 0 });
  const qualityRef = useRef<QualityMode>(qualityMode);
  const warnRef = useRef({
    isLow: false,
    lowStreak: 0,
    recoverStreak: 0,
    lastMsg: null as string | null,
  });

  useEffect(() => {
    qualityRef.current = qualityMode;
  }, [qualityMode]);

  useFrame((_, delta) => {
    accRef.current.t += delta;
    accRef.current.frames++;
    if (accRef.current.t < 1) return;

    const fps = accRef.current.frames / accRef.current.t;
    const frameMs = (accRef.current.t / accRef.current.frames) * 1000;
    accRef.current.t = 0;
    accRef.current.frames = 0;
    setStats({ fps, frameMs });

    const LOW = 35, HIGH = 50;
    if (fps < LOW) {
      warnRef.current.lowStreak++;
      warnRef.current.recoverStreak = 0;
    } else if (fps > HIGH) {
      warnRef.current.recoverStreak++;
      warnRef.current.lowStreak = 0;
    }
    if (!warnRef.current.isLow && warnRef.current.lowStreak >= 3) {
      warnRef.current.isLow = true;
      if (qualityRef.current !== "low") {
        qualityRef.current = "low";
        onQualityChange?.("low", "low-fps");
      }
      const msg =
        "Low FPS detected. Consider switching to low quality.";
      if (warnRef.current.lastMsg !== msg) {
        warnRef.current.lastMsg = msg;
        onWarningChange?.(msg);
      }
    }
    if (warnRef.current.isLow && warnRef.current.recoverStreak >= 3) {
      warnRef.current.isLow = false;
      if (qualityRef.current !== "high") {
        qualityRef.current = "high";
        onQualityChange?.("high", "recovered-fps");
      }
      onWarningChange?.(null);
    }
  });

  useEffect(() => () => onWarningChange?.(null), [onWarningChange]);

  if (!visible) return null;

  return (
    <Html fullscreen>
      <div
        className={`pointer-events-none select-none z-50 ${positionClassName}`}
      >
        <div className="rounded-lg border border-cyan-500/30 bg-black/70 px-3 py-2 backdrop-blur-md shadow-[0_0_18px_rgba(34,211,238,0.2)]">
          <div className="text-[10px] font-mono text-cyan-300 uppercase tracking-widest">
            Performance
          </div>
          <div className="mt-1 grid grid-cols-3 gap-2 text-[10px] font-mono">
            <div>
              <div className="text-white/50">FPS</div>
              <div
                className={
                  warnRef.current.isLow ? "text-orange-300" : "text-cyan-200"
                }
              >
                {Math.round(stats.fps)}
              </div>
            </div>
            <div>
              <div className="text-white/50">Frame</div>
              <div
                className={
                  warnRef.current.isLow ? "text-orange-300" : "text-cyan-200"
                }
              >
                {stats.frameMs.toFixed(1)} ms
              </div>
            </div>
            <div>
              <div className="text-white/50">Quality</div>
              <div
                className={
                  qualityMode === "high" ? "text-cyan-200" : "text-white/60"
                }
              >
                {qualityMode.toUpperCase()}
              </div>
            </div>
          </div>
        </div>
      </div>
    </Html>
  );
}
