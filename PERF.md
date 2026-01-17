# Performance Checklist (Hyperscale)

Use this checklist to verify load speed and animation smoothness before shipping.

## Browser profiling (Chrome DevTools)
1. Open DevTools → **Performance**.
2. Enable **Screenshots** and **Web Vitals**.
3. Check **Disable cache**.
4. Record a hard refresh and first interaction (click + scroll) for ~10 seconds.
5. Confirm:
   - Above-the-fold content renders immediately (no blank screen).
   - No long tasks > 50ms during initial interactions.
   - Average frame budget near 8-16ms.
   - Above-the-fold animation starts within 0–50ms after FCP.

## Long tasks + layout shift
1. Open the console in development.
2. Confirm `startPerfMonitor` logs **no** long tasks > 50ms.
3. Verify CLS stays near 0 (no unexpected layout shifts).
4. Confirm no bundle size warnings (>300KB script transfer).

## FPS & frame-time checks
1. Use the **Rendering** tab → enable **FPS meter**.
2. Confirm stable 60fps during camera movement and hover interactions.
3. If frame drops are visible, profile GPU timeline for heavy effects.

## Mid-tier device simulation
1. Open DevTools → **Performance** → set **CPU 4× slowdown**.
2. Reload the page.
3. Confirm the shell still renders immediately and interactions remain responsive.

## Regression checklist
- No `opacity: 0` or `display: none` gating on app shell.
- Reduced motion preference removes large camera movements.
- Animation tokens are used for new UI motion.
- CSS baseline animations run even with JS disabled.
