export const startAnimationScheduler = () => {
  let rafId = 0;
  const root = document.documentElement;

  const schedule = () => {
    rafId = window.requestAnimationFrame(() => {
      root.dataset.motion = "ready";
    });
  };

  schedule();

  return () => {
    window.cancelAnimationFrame(rafId);
  };
};
