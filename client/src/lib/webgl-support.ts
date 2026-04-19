export type WebGLSupportState = {
  supported: boolean;
  reason: string;
};

/**
 * Permissive WebGL detection.
 *
 * Historically we returned `supported: false` the first time `getContext`
 * handed us a null, which fired on plenty of machines that actually have
 * working WebGL (browser returns null on a detached canvas the first tick
 * after page load, particularly on Chromium with hardware acceleration
 * warming up). That produced false negatives in production.
 *
 * New rule: if the browser exposes a WebGL rendering API at all, we
 * consider it supported. We still probe a context to populate `reason`
 * and to surface true failures (explicit throws), but we do NOT fail-
 * closed on a null context when the API surface exists. Three.js will
 * retry context creation at render time and also emits its own error
 * through the error boundary if that second attempt genuinely fails.
 */
export function detectWebGLSupport(): WebGLSupportState {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return {
      supported: false,
      reason: "3D support can only be checked in a browser environment.",
    };
  }

  const hasWebGL2 = typeof window.WebGL2RenderingContext !== "undefined";
  const hasWebGL1 = typeof window.WebGLRenderingContext !== "undefined";

  if (!hasWebGL1 && !hasWebGL2) {
    return {
      supported: false,
      reason: "This browser does not expose WebGL rendering APIs.",
    };
  }

  // Try to probe a context, but treat failure as informational only.
  try {
    const canvas = document.createElement("canvas");
    const attrs: WebGLContextAttributes = {
      failIfMajorPerformanceCaveat: false,
      powerPreference: "default",
    };
    const gl2 = hasWebGL2 ? canvas.getContext("webgl2", attrs) : null;
    if (gl2) {
      return { supported: true, reason: "WebGL 2 is available." };
    }
    const gl =
      canvas.getContext("webgl", attrs) ||
      canvas.getContext("experimental-webgl", attrs);
    if (gl) {
      return { supported: true, reason: "WebGL is available." };
    }
    // API surface exists but probe returned null. Trust the surface —
    // the real renderer will try again inside a mounted canvas.
    return {
      supported: true,
      reason:
        "WebGL APIs are present. Renderer will finalize context on mount.",
    };
  } catch (_error) {
    // API surface exists but probing threw. Still fail-open — we'd
    // rather show the scene and let the error boundary handle a true
    // failure than pre-emptively lock people out.
    return {
      supported: true,
      reason:
        "WebGL APIs are present. Deferring final context creation to the renderer.",
    };
  }
}
