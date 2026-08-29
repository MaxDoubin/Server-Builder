export type WebGLTier = "none" | "webgl1" | "webgl2";
export type GameRenderProfile = "cinematic" | "balanced" | "compatibility";

export type WebGLSupportState = {
  supported: boolean;
  reason: string;
  tier: WebGLTier;
  renderer?: string;
  safeDpr: number;
  prefersCompatibility: boolean;
};

function readRendererName(gl: WebGLRenderingContext | WebGL2RenderingContext) {
  const debugInfo = gl.getExtension("WEBGL_debug_renderer_info");
  if (!debugInfo) return undefined;
  const renderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
  return typeof renderer === "string" ? renderer : undefined;
}

/**
 * `getContext("experimental-webgl")` has no entry in the DOM overload list, so
 * the legacy fallback below widens the result all the way to `RenderingContext`.
 * Narrow it back with instanceof rather than asserting. The `typeof` checks keep
 * the guard from throwing on browsers that never define the constructor.
 */
function isWebGLContext(
  context: RenderingContext,
): context is WebGLRenderingContext | WebGL2RenderingContext {
  if (
    typeof WebGLRenderingContext !== "undefined" &&
    context instanceof WebGLRenderingContext
  ) {
    return true;
  }
  return (
    typeof WebGL2RenderingContext !== "undefined" &&
    context instanceof WebGL2RenderingContext
  );
}

function isSoftwareRenderer(renderer?: string) {
  if (!renderer) return false;
  return /swiftshader|llvmpipe|software|basic render driver|microsoft/i.test(renderer);
}

function getDeviceCapabilityHints() {
  if (typeof navigator === "undefined") {
    return {
      lowMemory: false,
      lowConcurrency: false,
    };
  }

  const nav = navigator as Navigator & { deviceMemory?: number };
  return {
    lowMemory: typeof nav.deviceMemory === "number" ? nav.deviceMemory <= 4 : false,
    lowConcurrency:
      typeof nav.hardwareConcurrency === "number" ? nav.hardwareConcurrency <= 4 : false,
  };
}

export function getRecommendedRenderProfile(
  support: WebGLSupportState,
): GameRenderProfile {
  if (!support.supported) return "compatibility";
  if (support.tier === "webgl2" && !support.prefersCompatibility) {
    return "cinematic";
  }
  if (support.tier === "webgl2" || support.tier === "webgl1") {
    return support.prefersCompatibility ? "compatibility" : "balanced";
  }
  return "compatibility";
}

export function getDowngradedRenderProfile(
  profile: GameRenderProfile,
): GameRenderProfile | null {
  if (profile === "cinematic") return "balanced";
  if (profile === "balanced") return "compatibility";
  return null;
}

/**
 * Permissive WebGL detection with enough detail to choose a safer renderer
 * profile when a device looks marginal.
 */
export function detectWebGLSupport(): WebGLSupportState {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return {
      supported: false,
      reason: "3D support can only be checked in a browser environment.",
      tier: "none",
      safeDpr: 1,
      prefersCompatibility: true,
    };
  }

  const hasWebGL2 = typeof window.WebGL2RenderingContext !== "undefined";
  const hasWebGL1 = typeof window.WebGLRenderingContext !== "undefined";

  if (!hasWebGL1 && !hasWebGL2) {
    return {
      supported: false,
      reason: "This browser does not expose WebGL rendering APIs.",
      tier: "none",
      safeDpr: 1,
      prefersCompatibility: true,
    };
  }

  const { lowConcurrency, lowMemory } = getDeviceCapabilityHints();

  try {
    const canvas = document.createElement("canvas");
    const attempts: WebGLContextAttributes[] = [
      { failIfMajorPerformanceCaveat: false, powerPreference: "high-performance" },
      { failIfMajorPerformanceCaveat: false, powerPreference: "default" },
      { failIfMajorPerformanceCaveat: false, powerPreference: "low-power", antialias: false },
    ];

    for (const attrs of attempts) {
      const gl2 = hasWebGL2 ? canvas.getContext("webgl2", attrs) : null;
      if (gl2) {
        const renderer = readRendererName(gl2);
        const softwareRenderer = isSoftwareRenderer(renderer);
        const prefersCompatibility =
          softwareRenderer || lowMemory || lowConcurrency;
        return {
          supported: true,
          reason: prefersCompatibility
            ? "WebGL 2 detected. Starting with the safer compatibility ladder."
            : "WebGL 2 detected. Full interactive rendering is available.",
          tier: "webgl2",
          renderer,
          safeDpr: softwareRenderer ? 1 : prefersCompatibility ? 1.25 : 2,
          prefersCompatibility,
        };
      }

      const gl =
        canvas.getContext("webgl", attrs) ||
        canvas.getContext("experimental-webgl", attrs);
      if (gl) {
        // Only WebGL 1 context ids were requested, so a non-WebGL context is
        // unreachable here. Skipping the renderer probe is still safer than
        // asserting: an unknown context just loses the software-renderer hint.
        const renderer = isWebGLContext(gl) ? readRendererName(gl) : undefined;
        const softwareRenderer = isSoftwareRenderer(renderer);
        return {
          supported: true,
          reason:
            "WebGL 1 detected. Starting in a lighter renderer profile for stability.",
          tier: "webgl1",
          renderer,
          safeDpr: softwareRenderer ? 1 : 1.25,
          prefersCompatibility: true,
        };
      }
    }

    return {
      supported: true,
      reason:
        "WebGL APIs are present. Final context creation will be deferred to the mounted renderer.",
      tier: hasWebGL2 ? "webgl2" : "webgl1",
      safeDpr: lowMemory || lowConcurrency ? 1.25 : 1.5,
      prefersCompatibility: lowMemory || lowConcurrency || !hasWebGL2,
    };
  } catch {
    return {
      supported: true,
      reason:
        "WebGL APIs are present. Falling back to a safer startup profile while the renderer mounts.",
      tier: hasWebGL2 ? "webgl2" : "webgl1",
      safeDpr: lowMemory || lowConcurrency ? 1.1 : 1.25,
      prefersCompatibility: true,
    };
  }
}
