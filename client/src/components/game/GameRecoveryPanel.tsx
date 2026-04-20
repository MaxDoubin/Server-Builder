import { Cpu, Gauge, Layers3, RefreshCw, RotateCcw, ShieldAlert } from "lucide-react";
import { Link } from "wouter";
import type { GameRenderProfile, WebGLSupportState } from "@/lib/webgl-support";

type GameRecoveryPanelProps = {
  support: WebGLSupportState;
  profile: GameRenderProfile;
  error?: Error | null;
  onRetry?: () => void;
  onDowngrade?: () => void;
};

const PROFILE_LABELS: Record<GameRenderProfile, string> = {
  cinematic: "Cinematic",
  balanced: "Balanced",
  compatibility: "Compatibility",
};

export function GameRecoveryPanel({
  support,
  profile,
  error,
  onRetry,
  onDowngrade,
}: GameRecoveryPanelProps) {
  const unsupported = !support.supported;
  const title = unsupported
    ? "3D compatibility unavailable"
    : "3D scene did not initialize";
  const body = unsupported
    ? support.reason
    : "The interactive lab hit a startup failure. This usually means a renderer, shader, or asset path failed during initialization, not necessarily that the device lacks WebGL.";

  return (
    <div className="relative flex h-full min-h-[560px] items-center justify-center overflow-hidden bg-[hsl(var(--brand-obsidian))] px-6 py-8 text-[hsl(var(--brand-bone))]">
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(circle at 18% 16%, hsl(var(--brand-cyan) / 0.16), transparent 24%), radial-gradient(circle at 84% 20%, hsl(var(--brand-signal) / 0.16), transparent 22%), radial-gradient(circle at 50% 78%, hsl(var(--brand-cyan) / 0.08), transparent 30%), linear-gradient(180deg, rgba(2, 6, 23, 0.24) 0%, rgba(2, 6, 23, 0.94) 100%)",
        }}
      />
      <div className="pointer-events-none absolute inset-0 opacity-[0.07] [background-image:linear-gradient(rgba(148,163,184,0.24)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.18)_1px,transparent_1px)] [background-size:72px_72px] animate-telemetry-drift" />
      <div className="pointer-events-none absolute left-[8vw] top-[10vh] h-[18rem] w-[18rem] rounded-full bg-[hsl(var(--brand-cyan)/0.14)] blur-3xl animate-aurora-drift" />
      <div className="pointer-events-none absolute right-[10vw] top-[20vh] h-[22rem] w-[22rem] rounded-full bg-[hsl(var(--brand-signal)/0.12)] blur-3xl animate-panel-float" />

      <div className="relative grid w-full max-w-[1320px] gap-8 lg:grid-cols-[minmax(0,0.94fr)_minmax(340px,0.86fr)]">
        <div className="overflow-hidden rounded-[32px] border border-[hsl(var(--brand-iron))] bg-[linear-gradient(180deg,hsl(var(--brand-graphite)/0.9),hsl(var(--brand-obsidian)/0.84))] p-7 shadow-[0_36px_140px_-48px_rgba(0,0,0,0.9)] backdrop-blur-xl md:p-9">
          <div className="absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,hsl(var(--brand-signal)),transparent)] opacity-80" />

          <div className="flex flex-wrap items-center gap-3 font-techno text-[10px] uppercase tracking-[0.4em] text-[hsl(var(--brand-signal))]">
            <ShieldAlert className="h-4 w-4" />
            Interactive Lab Recovery
          </div>

          <h2 className="mt-5 font-display text-[clamp(2.2rem,4.2vw,4rem)] font-medium leading-[0.95] tracking-[-0.05em] text-[hsl(var(--brand-bone))]">
            {title}
          </h2>
          <p className="mt-4 max-w-[58ch] font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))] md:text-base">
            {body}
          </p>

          <div className="mt-7 grid gap-3 sm:grid-cols-3">
            <DetailCard icon={<Layers3 className="h-4 w-4 text-[hsl(var(--brand-cyan))]" />} label="Profile" value={PROFILE_LABELS[profile]} />
            <DetailCard icon={<Gauge className="h-4 w-4 text-[hsl(var(--brand-cyan))]" />} label="Renderer Tier" value={support.tier === "webgl2" ? "WebGL 2" : support.tier === "webgl1" ? "WebGL 1" : "Unavailable"} />
            <DetailCard icon={<Cpu className="h-4 w-4 text-[hsl(var(--brand-cyan))]" />} label="Renderer" value={support.renderer ?? "Browser-managed"} />
          </div>

          {error?.message && (
            <div className="mt-5 rounded-[22px] border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.48)] px-4 py-4 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
              <span className="text-[hsl(var(--brand-bone-dim))]">Technical detail:</span> {error.message}
            </div>
          )}

          <div className="mt-7 flex flex-wrap gap-3">
            {onRetry && !unsupported && (
              <button
                type="button"
                onClick={onRetry}
                className="inline-flex items-center gap-2 rounded-full border border-[hsl(var(--brand-cyan)/0.35)] bg-[hsl(var(--brand-cyan)/0.1)] px-4 py-2 font-mono-tight text-[11px] uppercase tracking-[0.24em] text-[hsl(var(--brand-bone))] transition-colors hover:bg-[hsl(var(--brand-cyan)/0.16)]"
              >
                <RotateCcw className="h-4 w-4" />
                Retry scene
              </button>
            )}
            {onDowngrade && (
              <button
                type="button"
                onClick={onDowngrade}
                className="inline-flex items-center gap-2 rounded-full border border-[hsl(var(--brand-signal)/0.36)] bg-[hsl(var(--brand-signal)/0.12)] px-4 py-2 font-mono-tight text-[11px] uppercase tracking-[0.24em] text-[hsl(var(--brand-bone))] transition-colors hover:bg-[hsl(var(--brand-signal)/0.18)]"
              >
                <Gauge className="h-4 w-4" />
                Launch safe mode
              </button>
            )}
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="inline-flex items-center gap-2 rounded-full border border-[hsl(var(--brand-bone)/0.16)] bg-[hsl(var(--brand-bone)/0.08)] px-4 py-2 font-mono-tight text-[11px] uppercase tracking-[0.24em] text-[hsl(var(--brand-bone))] transition-colors hover:bg-[hsl(var(--brand-bone)/0.14)]"
            >
              <RefreshCw className="h-4 w-4" />
              Reload page
            </button>
            <Link
              href="/"
              className="inline-flex items-center gap-2 rounded-full border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-graphite)/0.5)] px-4 py-2 font-mono-tight text-[11px] uppercase tracking-[0.24em] text-[hsl(var(--brand-bone-dim))] transition-colors hover:text-[hsl(var(--brand-bone))]"
            >
              Profile home
            </Link>
          </div>
        </div>

        <RackPreview profile={profile} />
      </div>
    </div>
  );
}

function DetailCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-[22px] border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.46)] px-4 py-4 backdrop-blur-md">
      <div className="flex items-center gap-2 text-[hsl(var(--brand-bone-dim))]">{icon}<span className="font-techno text-[10px] uppercase tracking-[0.32em]">{label}</span></div>
      <div className="mt-3 text-sm leading-relaxed text-[hsl(var(--brand-bone))]">{value}</div>
    </div>
  );
}

function RackPreview({ profile }: { profile: GameRenderProfile }) {
  const density = profile === "cinematic" ? 16 : profile === "balanced" ? 12 : 9;

  return (
    <div className="relative overflow-hidden rounded-[32px] border border-[hsl(var(--brand-iron))] bg-[linear-gradient(180deg,hsl(var(--brand-graphite)/0.88),hsl(var(--brand-obsidian)/0.86))] p-6 shadow-[0_36px_140px_-48px_rgba(0,0,0,0.9)] backdrop-blur-xl">
      <div className="absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,hsl(var(--brand-cyan)),transparent)] opacity-80" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,hsl(var(--brand-cyan)/0.16),transparent_30%),radial-gradient(circle_at_50%_100%,hsl(var(--brand-signal)/0.12),transparent_26%)] animate-aurora-drift" />
      <div className="relative flex h-full min-h-[420px] flex-col justify-between">
        <div>
          <div className="font-techno text-[10px] uppercase tracking-[0.36em] text-[hsl(var(--brand-signal))]">
            Alternate Experience
          </div>
          <h3 className="mt-4 font-display text-[clamp(1.5rem,3vw,2.4rem)] font-medium leading-[0.98] tracking-[-0.04em] text-[hsl(var(--brand-bone))]">
            The lab still has a pulse while 3D recovers.
          </h3>
          <p className="mt-3 max-w-[40ch] font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
            This recovery surface keeps the page branded and alive while the renderer retries or steps down to a safer profile.
          </p>
        </div>

        <div className="relative mt-8 flex items-center justify-center">
          <div className="absolute inset-x-[18%] top-4 h-4 rounded-full bg-[hsl(var(--brand-signal)/0.2)] blur-xl" />
          <div className="relative h-[330px] w-[220px] rounded-[26px] border border-[hsl(var(--brand-iron))] bg-[linear-gradient(180deg,#070a11_0%,#02040a_100%)] p-4 shadow-[0_26px_80px_-30px_rgba(0,0,0,0.9)]">
            <div className="absolute inset-y-3 left-3 w-px bg-[linear-gradient(180deg,transparent,hsl(var(--brand-cyan)/0.3),transparent)]" />
            <div className="absolute inset-y-3 right-3 w-px bg-[linear-gradient(180deg,transparent,hsl(var(--brand-signal)/0.3),transparent)]" />
            <div className="absolute inset-x-4 top-4 h-px bg-[linear-gradient(90deg,transparent,hsl(var(--brand-cyan)/0.4),transparent)]" />
            <div className="absolute inset-x-4 bottom-4 h-px bg-[linear-gradient(90deg,transparent,hsl(var(--brand-signal)/0.4),transparent)]" />
            <div className="absolute inset-0 overflow-hidden rounded-[22px]">
              <div className="absolute inset-y-0 -left-1/3 w-1/2 bg-[linear-gradient(90deg,transparent,hsl(var(--brand-cyan)/0.12),transparent)] blur-2xl animate-loader-sweep" />
            </div>
            <div className="relative flex h-full flex-col gap-2 rounded-[18px] border border-[hsl(var(--brand-iron))] bg-[linear-gradient(180deg,rgba(10,14,20,0.94)_0%,rgba(3,5,10,0.96)_100%)] px-3 py-3">
              {Array.from({ length: density }).map((_, index) => (
                <div
                  key={index}
                  className="relative overflow-hidden rounded-md border border-[hsl(var(--brand-carbon))] bg-[linear-gradient(90deg,rgba(12,16,22,0.96),rgba(4,7,12,0.96),rgba(10,14,20,0.96))] px-3 py-2"
                >
                  <div className="absolute inset-y-0 -left-1/4 w-1/2 bg-[linear-gradient(90deg,transparent,hsl(var(--brand-cyan)/0.18),transparent)] animate-loader-sweep" style={{ animationDelay: `${index * 0.12}s` }} />
                  <div className="relative flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span
                        className="inline-flex h-1.5 w-1.5 rounded-full text-[hsl(var(--brand-signal))] animate-rack-led"
                        style={{ background: "currentColor" }}
                      />
                      <span className="font-mono-tight text-[10px] uppercase tracking-[0.22em] text-[hsl(var(--brand-bone-dim))]">
                        Unit {String(index + 1).padStart(2, "0")}
                      </span>
                    </div>
                    <span className="h-1 w-10 rounded-full bg-[linear-gradient(90deg,transparent,hsl(var(--brand-cyan)/0.5),transparent)] animate-loader-sheen" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-8 grid gap-3 sm:grid-cols-3">
          <Stat value="Adaptive" label="Render ladder" />
          <Stat value="Graceful" label="Fallback surface" />
          <Stat value="Safer" label="Compatibility boot" />
        </div>
      </div>
    </div>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-[18px] border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.44)] px-4 py-3 text-center">
      <div className="font-display text-xl tracking-[-0.04em] text-[hsl(var(--brand-bone))]">{value}</div>
      <div className="mt-1 font-techno text-[10px] uppercase tracking-[0.26em] text-[hsl(var(--brand-bone-dim))]">{label}</div>
    </div>
  );
}
