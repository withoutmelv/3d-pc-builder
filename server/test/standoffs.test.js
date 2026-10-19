import test from 'node:test';
import * as THREE from 'three';
import { createStandoff } from '../../web/src/three/workbench-models.js';
import assert from 'node:assert/strict';
import { createRoomAssembly, changeStock, validateRoomSelection } from '../../shared/room.js';
import {
  getStandoffs,
  transitionAssembly as apply,
  validateAssembly,
} from '../../shared/assembly.js';
import { createApp } from '../src/app.js';
import { listParts } from '../src/service/parts.js';
const selection = { case: 'case-air', motherboard: 'board-a5' };
test('interactive support spans the case floor to the board underside', () => {
  const support = createStandoff();
  support.position.y = 32;
  const bounds = new THREE.Box3().setFromObject(support);
  assert.equal(bounds.min.y, 15);
  assert.ok(bounds.max.y >= 41 && bounds.max.y < 41.3);
  support.traverse((object) => {
    object.geometry?.dispose();
    object.material?.dispose();
  });
});
const open = () =>
  apply(createRoomAssembly(selection), {
    type: 'table-place',
    part: 'panel',
    pose: { x: 500, z: 0, rotation: 0 },
  });

test('standoffs can be removed and replaced in any order before board installation', () => {
  const original = open();
  let state = original;
  for (const index of [2, 0, 3, 1]) state = apply(state, { type: 'standoff-remove', index });
  assert.deepEqual(original.standoffs, [true, true, true, true]);
  assert.throws(() => apply(state, { type: 'board-to-case' }), /铜柱/);
  for (const index of [1, 3, 0]) state = apply(state, { type: 'standoff-install', index });
  assert.throws(() => apply(state, { type: 'board-to-case' }), /铜柱/);
  state = apply(state, { type: 'standoff-install', index: 2 });
  state = apply(state, { type: 'board-to-case' });
  assert.equal(state.cpu, 'tray');
  validateRoomSelection(state, selection, listParts());
  assert.throws(() => apply(state, { type: 'standoff-remove', index: 0 }), /取出主板/);
  state = apply(state, { type: 'board-remove' });
  assert.equal(apply(state, { type: 'standoff-remove', index: 0 }).standoffs[0], false);
});

test('standoff actions reject obstruction, missing case, invalid index and duplicate operations', () => {
  assert.throws(
    () => apply(createRoomAssembly(selection), { type: 'standoff-remove', index: 0 }),
    /侧板/,
  );
  assert.throws(
    () => apply(createRoomAssembly({}), { type: 'standoff-install', index: 0 }),
    /机箱/,
  );
  for (const index of [-1, 4, 0.5, '0', undefined])
    assert.throws(() => apply(open(), { type: 'standoff-remove', index }), /位置/);
  assert.throws(() => apply(open(), { type: 'standoff-install', index: 0 }), /已装/);
  const missing = apply(open(), { type: 'standoff-remove', index: 0 });
  assert.throws(() => apply(missing, { type: 'standoff-remove', index: 0 }), /没有铜柱/);
  for (const standoffs of [null, [true], [1, 1, 1, 1]])
    assert.throws(() => validateAssembly({ ...open(), standoffs }), /铜柱/);
  assert.throws(() => validateAssembly({ ...missing, board: 'case' }), /铜柱/);
  assert.throws(
    () => validateAssembly({ ...createRoomAssembly({}), standoffs: [true, true, true, true] }),
    /机箱/,
  );
});

test('legacy preinstalled supports remain compatible and replacement case owns fresh supports', () => {
  const legacy = open();
  delete legacy.standoffs;
  assert.deepEqual(getStandoffs(legacy), [true, true, true, true]);
  validateAssembly(apply(legacy, { type: 'board-to-case' }));
  const missing = apply(legacy, { type: 'standoff-remove', index: 1 });
  assert.equal(legacy.standoffs, undefined);
  const returned = apply(missing, {
    type: 'table-place',
    part: 'standoff1',
    pose: { x: -2000, z: 580, y: -80, rotation: 0 },
  });
  const closed = apply(returned, { type: 'panel-close' });
  const removed = changeStock(closed, selection, 'case', null);
  assert.equal(removed.assembly.standoffs, undefined);
  const replaced = changeStock(removed.assembly, removed.selection, 'case', 'case-air');
  assert.deepEqual(replaced.assembly.standoffs, [true, true, true, true]);
});

test('partial standoffs survive API persistence and unsupported board state is rejected', async () => {
  const app = createApp({ dbPath: ':memory:' });
  try {
    const assembly = apply(open(), { type: 'standoff-remove', index: 3 });
    const payload = { name: 'standoffs', selection, assembly };
    const created = await app.inject({ method: 'POST', url: '/api/builds', payload });
    assert.equal(created.statusCode, 201, created.body);
    const url = `/api/builds/${created.json().data.id}`;
    const invalid = await app.inject({
      method: 'PUT',
      url,
      payload: { ...payload, assembly: { ...assembly, board: 'case' } },
    });
    assert.equal(invalid.statusCode, 400, invalid.body);
    const read = await app.inject({ method: 'GET', url });
    assert.deepEqual(read.json().data.assembly, assembly);
  } finally {
    await app.close();
  }
});

test('loose standoffs retain poses and can exchange mounting holes', () => {
  const original = open();
  const pose = { x: -800, z: 400, rotation: 90 };
  let state = apply(original, { type: 'table-place', part: 'standoff0', pose });
  assert.deepEqual(state.layout.standoff0, pose);
  assert.deepEqual(state.standoffSlots, [null, 1, 2, 3]);
  assert.equal(original.standoffSlots, undefined);
  state = apply(state, { type: 'standoff-install', index: 0, partIndex: 1 });
  assert.deepEqual(state.standoffSlots, [null, 0, 2, 3]);
  state = apply(state, { type: 'standoff-install', index: 1, partIndex: 0 });
  assert.deepEqual(state.standoffSlots, [1, 0, 2, 3]);
  state = apply(state, { type: 'board-to-case' });
  assert.throws(() => apply(state, { type: 'table-place', part: 'standoff0', pose }));
  assert.throws(() => validateAssembly({ ...state, standoffSlots: [0, 0, 2, 3] }));
  assert.throws(() => validateAssembly({ ...state, standoffSlots: [null, 0, 2, 3] }));
});
