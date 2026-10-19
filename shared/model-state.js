import { DEFAULT_LAYOUT } from './workbench-layout.js';

// These catalogue entries use the new AM5 reference board with its integrated rear I/O.
export const hasIntegratedIO = (selection) =>
  ['board-a5', 'board-large'].includes(selection?.motherboard);

// Read-time compatibility only: never rewrite a user's saved assembly in the database.
export function upgradeModelState(state, selection) {
  if (!state) return state;
  const panel = state.layout?.panel;
  const oldPanel = panel?.x === 387 && panel.z === 357 && panel.rotation === 90 && !panel.y;
  const oldShield = hasIntegratedIO(selection) && state.ioShield !== undefined;
  if (!oldPanel && !oldShield) return state;
  const next = { ...state, layout: { ...state.layout } };
  if (oldPanel) next.layout.panel = { ...DEFAULT_LAYOUT.panel };
  if (oldShield) {
    delete next.ioShield;
    delete next.layout.ioShield;
  }
  return next;
}
