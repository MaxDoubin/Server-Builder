import { FC } from "react";
import { Button } from "@/components/ui/button";

interface GameHUDProps {
  isUnlocked: boolean;
  onUnlock?: () => void;
  showUnlock?: boolean;
  hideBottomBar?: boolean;
}

export const GameHUD: FC<GameHUDProps> = ({
  isUnlocked,
  onUnlock,
  showUnlock,
  hideBottomBar = false,
}) => {
  return (
    <>
      {showUnlock && !isUnlocked && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50">
          <Button
            type="button"
            onClick={onUnlock}
            className="bg-cyan-600/30 hover:bg-cyan-600/50 border border-cyan-400/40 text-white/80 text-xs uppercase"
          >
            Unlock Build Mode
          </Button>
        </div>
      )}

      {!hideBottomBar && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-40 pointer-events-none select-none">
          <div className="rounded-full border border-cyan-500/30 bg-black/85 px-3 py-2 text-[10px] font-mono text-white/70 backdrop-blur-md">
            Drag to rotate • Scroll to zoom • Click rack to inspect
          </div>
        </div>
      )}
    </>
  );
};
