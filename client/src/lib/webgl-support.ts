export type WebGLSupportState = {
  supported: boolean;
  reason: string;
};

export function detectWebGLSupport(): WebGLSupportState {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return {
      supported: false,
      reason: "3D support can only be checked in a browser environment.",
    };
  }

  try {
    const canvas = document.createElement("canvas");
    const hasWebGL2 = typeof window.WebGL2RenderingContext !== "undefined";
    const hasWebGL1 = typeof window.WebGLRenderingContext !== "undefined";

    if (!hasWebGL1 && !hasWebGL2) {
      return {
        supported: false,
        reason: "This browser does not expose WebGL rendering APIs.",
      };
    }

    const gl2 = hasWebGL2 ? canvas.getContext("webgl2") : null;
    if (gl2) {
      return {
        supported: true,
        reason: "WebGL 2 is available.",
      };
    }

    const gl =
      canvas.getContext("webgl") ||
      canvas.getContext("experimental-webgl");

    if (gl) {
      return {
        supported: true,
        reason: "WebGL is available.",
      };
    }

    return {
      supported: false,
      reason:
        "WebGL is exposed by the browser, but no rendering context could be created. Hardware acceleration may be blocked.",
    };
  } catch (error) {
    return {
      supported: false,
      reason:
        error instanceof Error
          ? error.message
          : "WebGL detection failed before a context could be created.",
    };
  }
}
