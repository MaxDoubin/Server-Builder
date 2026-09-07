/**
 * The achievement list, and the corner notification for a fresh unlock.
 *
 * The notification is absolutely positioned inside the scene box rather than
 * fixed to the viewport, like every other overlay here, so it cannot cover
 * page content that has nothing to do with the simulator. It is also not a
 * toast from the shared toaster: that queue holds one item at a time, and
 * unlocking three things at once would show one and silently drop two.
 */

import type {
  Achievement,
  AchievementContext,
  AchievementId,
  UnlockMap,
} from "@/lib/achievements";

function progressLabel(achievement: Achievement, context: AchievementContext | null): string | null {
  if (!achievement.progress || !context) return null;
  const { value, target } = achievement.progress(context);
  if (!Number.isFinite(value) || !Number.isFinite(target) || target <= 0) return null;
  const isDecimal = !Number.isInteger(value) || !Number.isInteger(target);
  const shown = isDecimal ? value.toFixed(2) : value.toLocaleString();
  const goal = isDecimal ? target.toFixed(2) : target.toLocaleString();
  return `${shown} / ${goal}`;
}

export function AchievementsPanel({
  achievements,
  unlocked,
  context,
}: {
  achievements: Achievement[];
  unlocked: UnlockMap;
  context: AchievementContext | null;
}) {
  const unlockedCount = achievements.filter((achievement) => unlocked[achievement.id]).length;

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between text-[10px] uppercase tracking-widest text-white/50">
        <span>Unlocked</span>
        <span className="font-mono text-cyan-200">
          {unlockedCount} / {achievements.length}
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
        <div
          className="h-full rounded-full bg-cyan-400 transition-[width] duration-300"
          style={{ width: `${(unlockedCount / achievements.length) * 100}%` }}
        />
      </div>

      <ul className="space-y-1.5">
        {achievements.map((achievement) => {
          const at = unlocked[achievement.id];
          const isUnlocked = Boolean(at);
          const progress = isUnlocked ? null : progressLabel(achievement, context);
          return (
            <li
              key={achievement.id}
              className={`rounded-md border p-2 ${
                isUnlocked
                  ? "border-cyan-400/40 bg-cyan-400/10"
                  : "border-white/10 bg-white/5"
              }`}
            >
              <div className="flex items-start gap-2">
                <span
                  aria-hidden
                  className={`mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border text-[10px] leading-none ${
                    isUnlocked
                      ? "border-cyan-300/70 bg-cyan-400/25 text-cyan-100"
                      : "border-white/20 text-white/30"
                  }`}
                >
                  {isUnlocked ? "★" : "·"}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <span
                      className={`text-[11px] font-medium ${
                        isUnlocked ? "text-cyan-100" : "text-white/70"
                      }`}
                    >
                      {achievement.title}
                    </span>
                    <span className="shrink-0 text-[9px] uppercase tracking-widest text-white/50">
                      {isUnlocked ? "Unlocked" : "Locked"}
                    </span>
                  </div>
                  <p className="mt-0.5 text-[10px] leading-relaxed text-white/50">
                    {isUnlocked ? achievement.description : achievement.requirement}
                  </p>
                  {progress && (
                    <p className="mt-0.5 font-mono text-[9px] text-white/50">{progress}</p>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function AchievementNotice({
  achievement,
  onDismiss,
}: {
  achievement: Achievement | undefined;
  onDismiss: (id: AchievementId) => void;
}) {
  if (!achievement) return null;

  return (
    <div
      className="absolute bottom-6 right-4 z-[60] w-[260px] rounded-xl border border-cyan-400/50 bg-black/90 p-3 shadow-[0_0_24px_rgba(34,211,238,0.25)] backdrop-blur-md"
      data-ui="true"
      role="status"
      aria-live="polite"
    >
      <div className="flex items-start gap-2">
        <span aria-hidden className="text-base leading-none text-cyan-300">
          ★
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[9px] uppercase tracking-[0.24em] text-cyan-300/80">
            Achievement unlocked
          </div>
          <div className="mt-0.5 text-xs font-semibold text-white">{achievement.title}</div>
          <p className="mt-1 text-[10px] leading-relaxed text-white/60">
            {achievement.description}
          </p>
        </div>
        <button
          type="button"
          onClick={() => onDismiss(achievement.id)}
          aria-label="Dismiss achievement notification"
          className="-mr-1 -mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-white/50 hover:bg-white/10 hover:text-white"
        >
          <span aria-hidden>×</span>
        </button>
      </div>
    </div>
  );
}
