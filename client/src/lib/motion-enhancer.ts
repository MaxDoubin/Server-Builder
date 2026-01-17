export const startMotionEnhancer = () => {
  try {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return;
    }
    document.body.dataset.motionEnhanced = "true";
  } catch (error) {
    if (import.meta.env.DEV) {
      console.warn("[motion] Enhancement failed, keeping baseline animations.", error);
    }
  }
};
