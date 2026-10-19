export const STANDOFF_KEYS = ['standoff0', 'standoff1', 'standoff2', 'standoff3'];
export const getStandoffs = (state) => state.standoffs ?? [true, true, true, true];
export const getStandoffSlots = (state) =>
  state.standoffSlots ?? getStandoffs(state).map((installed, index) => (installed ? index : null));
export const STANDOFF_LAYOUT = Object.fromEntries(
  STANDOFF_KEYS.map((key, i) => [key, { x: 650 + i * 35, z: 430, rotation: 0 }]),
);
