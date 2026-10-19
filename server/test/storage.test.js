import test from 'node:test';
import assert from 'node:assert/strict';
import { createRoomAssembly, canChangeStock, validateRoomSelection } from '../../shared/room.js';
import {
  getStorage,
  getStoragePressed,
  transitionAssembly as apply,
  validateAssembly,
} from '../../shared/assembly.js';
import { CART_LAYOUT } from '../../shared/workbench-layout.js';
import { listParts } from '../src/service/parts.js';
import { createApp } from '../src/app.js';
const selection = { motherboard: 'board-a5', storage: 'ssd-2' };
const start = () => createRoomAssembly(selection);
test('M.2 can be installed first on the cart; loose drive blocks moving the board until fixed', () => {
  const initial = start();
  const inserted = apply(initial, { type: 'storage-place' });
  assert.equal(getStorage(initial), 'tray');
  assert.equal(getStorage(inserted), 'seated');
  assert.throws(
    () =>
      apply(inserted, { type: 'table-place', part: 'board', pose: { x: 0, z: 0, rotation: 0 } }),
    /固定/,
  );
  assert.equal(canChangeStock(inserted, 'storage'), false);
  assert.equal(canChangeStock(inserted, 'motherboard'), false);
  const fixed = apply(apply(inserted, { type: 'storage-press' }), { type: 'storage-screw' });
  const moved = apply(fixed, {
    type: 'table-place',
    part: 'board',
    pose: { x: 0, z: 0, rotation: 90 },
  });
  assert.equal(getStorage(moved), 'locked');
  assert.deepEqual(moved.layout.storage, CART_LAYOUT.storage);
  assert.throws(
    () => apply(fixed, { type: 'table-place', part: 'storage', pose: CART_LAYOUT.storage }),
    /螺丝/,
  );
});
test('M.2 unscrews and removes without changing other components; legacy storage is loose', () => {
  const fixed = apply(apply(apply(start(), { type: 'storage-place' }), { type: 'storage-press' }), {
    type: 'storage-screw',
  });
  const loose = apply(fixed, { type: 'storage-unscrew' });
  const removed = apply(loose, {
    type: 'table-place',
    part: 'storage',
    pose: { x: 0, z: 150, rotation: 180 },
  });
  assert.equal(getStorage(removed), 'tray');
  assert.deepEqual(removed.memory, fixed.memory);
  assert.throws(() => apply(start(), { type: 'storage-screw' }), /插入/);
  const legacy = start();
  delete legacy.storage;
  validateAssembly(legacy);
  assert.equal(getStorage(legacy), 'tray');
  assert.throws(() => validateAssembly({ ...legacy, storage: 'bad' }), /磁盘/);
  assert.throws(
    () => apply(createRoomAssembly({ storage: 'ssd-1' }), { type: 'storage-place' }),
    /主板/,
  );
});
test('closed case blocks M.2 operations and a mismatched interface is rejected at installation', () => {
  let state = createRoomAssembly({ ...selection, case: 'case-air' });
  state = apply(apply(apply(state, { type: 'storage-place' }), { type: 'storage-press' }), {
    type: 'storage-screw',
  });
  state = apply(state, { type: 'table-place', part: 'panel', pose: { x: 0, z: 0, rotation: 0 } });
  state = apply(apply(state, { type: 'board-to-case' }), { type: 'panel-close' });
  assert.throws(() => apply(state, { type: 'storage-unscrew' }), /侧板/);
  const catalogue = listParts().map((p) =>
    p.id === 'ssd-2' ? { ...p, specs: { ...p.specs, interface: 'SATA' } } : p,
  );
  validateRoomSelection(start(), selection, catalogue);
  assert.throws(
    () => validateRoomSelection(apply(start(), { type: 'storage-place' }), selection, catalogue),
    /接口/,
  );
});
test('M.2 fixed state survives an API save and reopen; invalid installed inventory is rejected', async () => {
  const app = createApp({ dbPath: ':memory:' });
  try {
    const assembly = apply(
      apply(apply(start(), { type: 'storage-place' }), { type: 'storage-press' }),
      { type: 'storage-screw' },
    );
    let response = await app.inject({
      method: 'POST',
      url: '/api/builds',
      payload: { name: 'M.2 test', selection, assembly },
    });
    assert.equal(response.statusCode, 201, response.body);
    const id = response.json().data.id;
    response = await app.inject({ method: 'GET', url: `/api/builds/${id}` });
    assert.deepEqual(response.json().data.assembly, assembly);
    response = await app.inject({
      method: 'POST',
      url: '/api/builds',
      payload: {
        name: 'invalid M.2',
        selection: { storage: 'ssd-2' },
        assembly: { ...assembly, layout: { storage: CART_LAYOUT.storage } },
      },
    });
    assert.equal(response.statusCode, 400);
  } finally {
    await app.close();
  }
});

test('M.2 press and lift are reversible before fastening and do not constrain other assembly', () => {
  const inserted = apply(start(), { type: 'storage-place' });
  assert.equal(getStoragePressed(inserted), false);
  assert.throws(() => apply(inserted, { type: 'storage-screw' }), /压平/);
  assert.throws(() => apply(inserted, { type: 'storage-lift' }), /已经抬起/);
  const pressed = apply(inserted, { type: 'storage-press' });
  assert.equal(getStoragePressed(pressed), true);
  assert.equal(getStoragePressed(inserted), false);
  assert.equal(pressed.cpu, 'tray');
  assert.throws(() => apply(pressed, { type: 'storage-press' }), /已经压平/);
  const raised = apply(pressed, { type: 'storage-lift' });
  assert.equal(getStoragePressed(raised), false);
  const fixed = apply(pressed, { type: 'storage-screw' });
  assert.throws(() => apply(fixed, { type: 'storage-lift' }), /螺丝/);
  const unscrewed = apply(fixed, { type: 'storage-unscrew' });
  assert.equal(getStoragePressed(unscrewed), true);
  const removed = apply(unscrewed, {
    type: 'table-place',
    part: 'storage',
    pose: { x: 0, z: 150, rotation: 0 },
  });
  assert.equal(getStoragePressed(removed), false);
  assert.throws(() => apply(removed, { type: 'storage-press' }), /插入/);
});

test('M.2 press validation covers legacy states, impossible snapshots and closed panels', () => {
  const legacy = { ...start(), storage: 'locked' };
  validateAssembly(legacy);
  assert.equal(getStoragePressed(legacy), true);
  assert.throws(() => validateAssembly({ ...legacy, storagePressed: false }), /压平/);
  assert.throws(() => validateAssembly({ ...start(), storagePressed: true }), /未插入/);
  assert.throws(() => validateAssembly({ ...start(), storagePressed: 'yes' }), /下压/);
  let state = createRoomAssembly({ ...selection, case: 'case-air' });
  state = apply(state, { type: 'table-place', part: 'panel', pose: { x: 500, z: 0, rotation: 0 } });
  state = apply(state, { type: 'board-to-case' });
  state = apply(state, { type: 'storage-place' });
  state = apply(state, { type: 'panel-close' });
  assert.throws(() => apply(state, { type: 'storage-press' }), /侧板/);
});

test('M.2 pressed but unfixed state persists through the API', async () => {
  const app = createApp({ dbPath: ':memory:' });
  try {
    const assembly = apply(apply(start(), { type: 'storage-place' }), { type: 'storage-press' });
    const r = await app.inject({
      method: 'POST',
      url: '/api/builds',
      payload: { name: 'pressed M.2', selection, assembly },
    });
    assert.equal(r.statusCode, 201, r.body);
    const read = await app.inject({ method: 'GET', url: `/api/builds/${r.json().data.id}` });
    assert.deepEqual(read.json().data.assembly, assembly);
  } finally {
    await app.close();
  }
});
