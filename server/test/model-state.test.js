import test from 'node:test';
import assert from 'node:assert/strict';
import { createAssembly, validateAssembly } from '../../shared/assembly.js';
import { upgradeModelState } from '../../shared/model-state.js';
import { DEFAULT_LAYOUT } from '../../shared/workbench-layout.js';

test('legacy panel parking upgrades without mutating original save or assembly progress', () => {
  const state = createAssembly();
  state.layout.panel = { x: 387, z: 357, rotation: 90 };
  const original = structuredClone(state);
  const next = upgradeModelState(state, {});
  validateAssembly(next);
  assert.deepEqual(next.layout.panel, DEFAULT_LAYOUT.panel);
  assert.deepEqual(state, original);
  assert.equal(next.cpu, state.cpu);
  assert.equal(next.memory, state.memory);
});
test('integrated shield migration removes only the obsolete accessory', () => {
  const state = { ...createAssembly(), ioShield: 'installed' };
  state.layout.ioShield = { x: -800, z: 300, rotation: 0 };
  const next = upgradeModelState(state, { motherboard: 'board-a5' });
  assert.equal(next.ioShield, undefined);
  assert.equal(next.layout.ioShield, undefined);
  assert.equal(state.ioShield, 'installed');
  assert.equal(upgradeModelState(state, { motherboard: 'board-a4' }), state);
});
