import test from 'node:test';
import assert from 'node:assert/strict';
import { createRoomAssembly, canChangeStock, validateRoomSelection } from '../../shared/room.js';
import { getPower, transitionAssembly as apply, validateAssembly } from '../../shared/assembly.js';
import { CART_LAYOUT } from '../../shared/workbench-layout.js';
import { listParts } from '../src/service/parts.js';
import { createApp } from '../src/app.js';
const selection = { case: 'case-air', psu: 'psu-750' };
const start = () => createRoomAssembly(selection);
const opened = () =>
  apply(start(), { type: 'table-place', part: 'panel', pose: { x: -550, z: 0, rotation: 0 } });
const installed = () => apply(opened(), { type: 'psu-place' });
function fixed() {
  let state = installed();
  for (let index = 0; index < 4; index++) state = apply(state, { type: 'psu-screw', index });
  return state;
}
test('PSU installs before motherboard, requires four fasteners before carrying the case', () => {
  assert.throws(() => apply(start(), { type: 'psu-place' }), /侧板/);
  const state = installed();
  assert.equal(state.layout.board, undefined);
  assert.equal(getPower(state).placed, true);
  assert.equal(canChangeStock(state, 'psu'), false);
  assert.equal(canChangeStock(state, 'case'), false);
  const carry = { type: 'table-place', part: 'case', pose: { x: 0, z: 0, rotation: 90 } };
  assert.throws(() => apply(state, carry), /电源尚未固定/);
  const partial = apply(state, { type: 'psu-screw', index: 0 });
  assert.throws(() => apply(partial, carry), /电源尚未固定/);
  const mounted = fixed();
  const moved = apply(mounted, carry);
  assert.deepEqual(getPower(moved), getPower(mounted));
  assert.equal(getPower(state).screws.some(Boolean), false);
});
test('external PSU screws work with side panel closed; removal needs an open panel and no fasteners', () => {
  let state = apply(fixed(), { type: 'panel-close' });
  for (let index = 0; index < 4; index++) state = apply(state, { type: 'psu-unscrew', index });
  const remove = { type: 'table-place', part: 'psu', pose: CART_LAYOUT.psu };
  assert.throws(() => apply(state, remove), /侧板/);
  state = apply(state, {
    type: 'table-place',
    part: 'panel',
    pose: { x: -550, z: 0, rotation: 0 },
  });
  const partial = apply(state, { type: 'psu-screw', index: 2 });
  assert.throws(() => apply(partial, remove), /全部电源固定螺丝/);
  const removed = apply(state, remove);
  assert.equal(getPower(removed).placed, false);
  assert.equal(canChangeStock(removed, 'psu'), true);
  assert.throws(() => apply(removed, { type: 'psu-screw', index: 0 }), /电源位/);
  assert.throws(() => apply(installed(), { type: 'psu-screw', index: 4 }), /位置/);
});
test('PSU installation is independent of already mounted motherboard and GPU', () => {
  let state = createRoomAssembly({ ...selection, motherboard: 'board-a5', gpu: 'gpu-dual' });
  for (const action of [
    { type: 'table-place', part: 'panel', pose: { x: -550, z: 0, rotation: 0 } },
    ...[0, 1].flatMap((index) => [
      { type: 'slot-cover-unscrew', index },
      {
        type: 'table-place',
        part: `slotCover${index}`,
        pose: { x: -840 + index * 40, z: 350, rotation: 0 },
      },
    ]),
    { type: 'board-to-case' },
    ...[0, 1, 2, 3].map((index) => ({ type: 'screw', index })),
    { type: 'gpu-open' },
    { type: 'gpu-place' },
    { type: 'gpu-screw' },
  ])
    state = apply(state, action);
  const next = apply(state, { type: 'psu-place' });
  assert.deepEqual(next.graphics, state.graphics);
  assert.deepEqual(next.screws, state.screws);
  assert.equal(getPower(next).placed, true);
});
test('PSU schema, legacy saves and installed size compatibility are validated', () => {
  const legacy = start();
  delete legacy.power;
  validateAssembly(legacy);
  assert.equal(getPower(legacy).placed, false);
  assert.throws(
    () =>
      validateAssembly({
        ...legacy,
        power: { placed: false, screws: [true, false, false, false] },
      }),
    /未落位/,
  );
  assert.throws(
    () => validateAssembly({ ...legacy, power: { placed: true, screws: [false] } }),
    /状态/,
  );
  assert.throws(
    () => validateAssembly({ ...installed(), layout: { psu: CART_LAYOUT.psu } }),
    /机箱/,
  );
  const oversized = listParts().map((p) =>
    p.id === 'psu-750' ? { ...p, dimensions: [150, 86, 250] } : p,
  );
  validateRoomSelection(opened(), selection, oversized);
  assert.throws(() => validateRoomSelection(installed(), selection, oversized), /长度/);
  const wrongType = listParts().map((p) =>
    p.id === 'psu-750' ? { ...p, specs: { ...p.specs, formFactor: 'SFX' } } : p,
  );
  assert.throws(() => validateRoomSelection(installed(), selection, wrongType), /规格/);
});
test('PSU mounted state survives API save and invalid fixed state returns the shared error code', async () => {
  const app = createApp({ dbPath: ':memory:' });
  try {
    const assembly = fixed();
    let response = await app.inject({
      method: 'POST',
      url: '/api/builds',
      payload: { name: 'PSU test', selection, assembly },
    });
    assert.equal(response.statusCode, 201, response.body);
    const id = response.json().data.id;
    response = await app.inject({ method: 'GET', url: `/api/builds/${id}` });
    assert.deepEqual(response.json().data.assembly, assembly);
    response = await app.inject({
      method: 'POST',
      url: '/api/builds',
      payload: {
        name: 'invalid PSU',
        selection,
        assembly: { ...assembly, power: { ...assembly.power, placed: false } },
      },
    });
    assert.equal(response.statusCode, 400);
    assert.equal(response.json().code, 'VALIDATION_ERROR');
  } finally {
    await app.close();
  }
});

test('PSU bay leaves room for the motherboard and exposes the rear mounting opening', async () => {
  const THREE = await import('three');
  const { createCase, createBoard } = await import('../../web/src/three/workbench-models.js');
  const { createStockModel } = await import('../../web/src/three/stock-models.js');
  const chassis = createCase();
  const board = createBoard().group;
  board.position.set(-18, 43, -70);
  const psu = createStockModel(listParts().find((p) => p.id === 'psu-750'));
  psu.position.set(-50, 25, 155);
  try {
    const boardBounds = new THREE.Box3().setFromObject(board);
    const psuBounds = new THREE.Box3().setFromObject(psu);
    assert.ok(boardBounds.max.z <= psuBounds.min.z, 'board and PSU must not overlap');
    assert.ok(psuBounds.max.y < 176, 'PSU must fit below the side panel');
    chassis.updateMatrixWorld(true);
    const ray = new THREE.Raycaster(
      new THREE.Vector3(-50, 67, 400),
      new THREE.Vector3(0, 0, -1),
      0,
      180,
    );
    assert.equal(ray.intersectObject(chassis, true).length, 0, 'rear opening must be unobstructed');
  } finally {
    for (const root of [chassis, board, psu])
      root.traverse((o) => {
        o.geometry?.dispose();
        o.material?.dispose();
      });
  }
});
