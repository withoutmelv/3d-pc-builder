export const COVER_KEYS = ['slotCover0', 'slotCover1'];
// Old saves did not simulate removable covers; preserve their open GPU bay.
export const getSlotCovers = (state) => state.slotCovers ?? ['tray', 'tray'];
export const COVER_LAYOUT = {
  slotCover0: { x: -840, z: 350, rotation: 0 },
  slotCover1: { x: -800, z: 350, rotation: 0 },
};
export const gpuBayOpen = (state) => getSlotCovers(state).every((value) => value === 'tray');
