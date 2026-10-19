import test from 'node:test';
import assert from 'node:assert/strict';
import { createRoomAssembly, canChangeStock, validateRoomSelection } from '../../shared/room.js';
import {
  getGraphics,
  transitionAssembly as apply,
  validateAssembly,
} from '../../shared/assembly.js';
import { CART_LAYOUT } from '../../shared/workbench-layout.js';
import { listParts } from '../src/service/parts.js';
import { createApp } from '../src/app.js';
const catalogue = listParts();
const selection = {
  motherboard: 'board-a5',
  gpu: catalogue.find((p) => p.category === 'gpu').id,
  case: 'case-air',
};
const start = () => createRoomAssembly(selection);
const inserted = () => apply(apply(start(), { type: 'gpu-open' }), { type: 'gpu-place' });
function inCase() {
  let state = apply(inserted(), {
    type: 'table-place',
    part: 'panel',
    pose: { x: 0, z: 0, rotation: 0 },
  });
  for (let index = 0; index < 2; index++) {
    state = apply(state, { type: 'slot-cover-unscrew', index });
    state = apply(state, {
      type: 'table-place',
      part: `slotCover${index}`,
      pose: { x: -840 + index * 40, z: 350, rotation: 0 },
    });
  }
  state = apply(state, { type: 'board-to-case' });
  return state;
}
function fixed() {
  let state = inCase();
  for (let index = 0; index < 4; index++) state = apply(state, { type: 'screw', index });
  return apply(state, { type: 'gpu-screw' });
}
test('GPU installs on cart before CPU, follows board and needs its latch opened for removal', () => {
  assert.throws(() => apply(start(), { type: 'gpu-place' }), /卡扣/);
  const state = inserted();
  assert.deepEqual(getGraphics(state), { placed: true, latchOpen: false, screwed: false });
  assert.equal(state.cpu, 'tray');
  assert.equal(canChangeStock(state, 'gpu'), false);
  assert.equal(canChangeStock(state, 'motherboard'), false);
  assert.equal(canChangeStock(state, 'storage'), true);
  const moved = apply(state, {
    type: 'table-place',
    part: 'board',
    pose: { x: 0, z: 0, rotation: 90 },
  });
  assert.deepEqual(getGraphics(moved), getGraphics(state));
  assert.throws(
    () => apply(moved, { type: 'table-place', part: 'gpu', pose: CART_LAYOUT.gpu }),
    /卡扣/,
  );
  const open = apply(moved, { type: 'gpu-open' });
  assert.throws(
    () => apply(open, { type: 'table-place', part: 'board', pose: CART_LAYOUT.board }),
    /卡扣/,
  );
  const removed = apply(open, { type: 'table-place', part: 'gpu', pose: CART_LAYOUT.gpu });
  assert.equal(getGraphics(removed).placed, false);
  assert.equal(getGraphics(moved).placed, true);
  assert.equal(canChangeStock(removed, 'gpu'), true);
});
test('case bracket needs mounted board; removal requires undoing bracket and latch', () => {
  assert.throws(() => apply(inserted(), { type: 'gpu-screw' }), /机箱/);
  const gpuFirst = apply(inCase(), { type: 'gpu-screw' });
  assert.equal(getGraphics(gpuFirst).screwed, true);
  assert.deepEqual(gpuFirst.screws, [false, false, false, false]);
  assert.throws(() => apply(gpuFirst, { type: 'board-remove' }), /显卡挡板螺丝/);
  let boardAfter = gpuFirst;
  for (const index of [3, 1, 2, 0]) boardAfter = apply(boardAfter, { type: 'screw', index });
  assert.deepEqual(boardAfter, fixed());
  const state = fixed();
  assert.throws(() => apply(state, { type: 'gpu-open' }), /挡板螺丝/);
  const closed = apply(state, { type: 'panel-close' });
  assert.throws(() => apply(closed, { type: 'gpu-unscrew' }), /侧板/);
  const movedCase = apply(closed, {
    type: 'table-place',
    part: 'case',
    pose: { x: 450, z: 0, rotation: 90 },
  });
  assert.equal(getGraphics(movedCase).screwed, true);
  let boardLoose = state;
  for (let index = 0; index < 4; index++)
    boardLoose = apply(boardLoose, { type: 'unscrew', index });
  assert.throws(
    () =>
      apply(boardLoose, { type: 'table-place', part: 'board', pose: { x: 0, z: 0, rotation: 0 } }),
    /显卡挡板螺丝/,
  );
  const unscrewed = apply(state, { type: 'gpu-unscrew' });
  const removed = apply(apply(unscrewed, { type: 'gpu-open' }), {
    type: 'table-place',
    part: 'gpu',
    pose: CART_LAYOUT.gpu,
  });
  assert.equal(getGraphics(removed).placed, false);
  assert.deepEqual(removed.screws, state.screws);
});
test('GPU save validation rejects impossible states and checks length only inside case', () => {
  const legacy = start();
  delete legacy.graphics;
  validateAssembly(legacy);
  assert.equal(getGraphics(legacy).placed, false);
  assert.throws(
    () =>
      validateAssembly({ ...legacy, graphics: { placed: false, latchOpen: false, screwed: true } }),
    /挡板/,
  );
  assert.throws(
    () =>
      validateAssembly({
        ...legacy,
        graphics: { placed: 'yes', latchOpen: false, screwed: false },
      }),
    /显卡/,
  );
  assert.throws(
    () => apply(createRoomAssembly({ gpu: selection.gpu }), { type: 'gpu-open' }),
    /主板/,
  );
  const tooLong = catalogue.map((p) =>
    p.id === selection.gpu ? { ...p, specs: { ...p.specs, length: 500 } } : p,
  );
  validateRoomSelection(inserted(), selection, tooLong);
  assert.throws(() => validateRoomSelection(inCase(), selection, tooLong), /显卡长度/);
});
test('fixed GPU survives API save/reopen and invalid inventory returns a validation error', async () => {
  const app = createApp({ dbPath: ':memory:' });
  try {
    const assembly = fixed();
    let response = await app.inject({
      method: 'POST',
      url: '/api/builds',
      payload: { name: 'GPU test', selection, assembly },
    });
    assert.equal(response.statusCode, 201, response.body);
    const id = response.json().data.id;
    response = await app.inject({ method: 'GET', url: `/api/builds/${id}` });
    assert.deepEqual(response.json().data.assembly, assembly);
    response = await app.inject({
      method: 'POST',
      url: '/api/builds',
      payload: {
        name: 'invalid GPU',
        selection: { gpu: selection.gpu },
        assembly: { ...assembly, layout: { gpu: CART_LAYOUT.gpu } },
      },
    });
    assert.equal(response.statusCode, 400);
    assert.equal(response.json().code, 'VALIDATION_ERROR');
  } finally {
    await app.close();
  }
});
