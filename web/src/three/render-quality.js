export const RENDER_PROFILES = Object.freeze([
  { name: 'full', pixels: 1500000, ratio: 1.25, shadows: true },
  { name: 'balanced', pixels: 950000, ratio: 1, shadows: true },
  { name: 'light', pixels: 600000, ratio: 0.85, shadows: false },
]);

export function renderPixelRatio(width, height, deviceRatio, profile) {
  return Math.min(deviceRatio || 1, profile.ratio, Math.sqrt(profile.pixels / (width * height)));
}

// Measure only consecutive rendered frames: idle/hidden time is not GPU work.
export function createAdaptiveQuality() {
  let level = 0,
    previous = null,
    elapsed = 0,
    count = 0;
  let slowWindows = 0,
    fastWindows = 0,
    settleUntil = null;
  function clearWindow() {
    elapsed = 0;
    count = 0;
  }
  return {
    get profile() {
      return RENDER_PROFILES[level];
    },
    sample(time, rendered) {
      if (!rendered || !Number.isFinite(time)) {
        previous = null;
        clearWindow();
        slowWindows = 0;
        fastWindows = 0;
        return false;
      }
      const interval = previous === null ? 0 : time - previous;
      if (settleUntil === null) settleUntil = time + 2000;
      previous = time;
      if (interval <= 0 || interval > 250 || time < settleUntil) {
        clearWindow();
        slowWindows = 0;
        fastWindows = 0;
        return false;
      }
      elapsed += interval;
      count++;
      if (elapsed < 1200 || count < 12) return false;
      const average = elapsed / count;
      slowWindows = average > 28 ? slowWindows + 1 : 0;
      fastWindows = average < 19 ? fastWindows + 1 : 0;
      clearWindow();
      const next =
        slowWindows >= 2
          ? Math.min(2, level + 1)
          : fastWindows >= 8
            ? Math.max(0, level - 1)
            : level;
      if (next === level) return false;
      level = next;
      settleUntil = time + 5000;
      slowWindows = 0;
      fastWindows = 0;
      return true;
    },
  };
}
