import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  createRoomAssembly,
  changeStock,
  canChangeStock,
  validateRoomSelection,
} from '../../shared/room.js';
import { transitionAssembly as apply, validateAssembly } from '../../shared/assembly.js';
import { CART_LAYOUT } from '../../shared/workbench-layout.js';
import { createApp } from '../src/app.js';
import { listParts } from '../src/service/parts.js';
import { createCase, createIOShield } from '../../web/src/three/workbench-models.js';
const selection = { motherboard: 'board-a4', case: 'case-air' };
const open = () =>
  apply(createRoomAssembly(selection), {
    type: 'table-place',
    part: 'panel',
    pose: { x: 500, z: 0, rotation: 0 },
  });

test('shield is a loose motherboard accessory that installs without CPU or board assembly', () => {
  const initial = open();
  assert.equal(initial.ioShield, 'tray');
  const state = apply(initial, { type: 'io-shield-install' });
  assert.equal(state.ioShield, 'installed');
  assert.equal(initial.ioShield, 'tray');
  assert.equal(state.cpu, 'tray');
  validateRoomSelection(state, selection, listParts());
  assert.throws(() => apply(createRoomAssembly(selection), { type: 'io-shield-install' }), /侧板/);
  assert.throws(() => apply(state, { type: 'io-shield-install' }));
  assert.equal(canChangeStock(state, 'motherboard'), false);
  assert.equal(canChangeStock(state, 'case'), false);
});

test('board can enter without a shield, but must move out before installing or removing it', () => {
  let state = apply(open(), { type: 'board-to-case' });
  assert.equal(state.ioShield, 'tray');
  assert.throws(() => apply(state, { type: 'io-shield-install' }), /取出主板/);
  state = apply(state, { type: 'board-remove' });
  state = apply(state, { type: 'io-shield-install' });
  state = apply(state, { type: 'board-to-case' });
  const remove = { type: 'table-place', part: 'ioShield', pose: { x: -800, z: 300, rotation: 90 } };
  assert.throws(() => apply(state, remove), /取出主板/);
  const closed = apply(state, { type: 'panel-close' });
  assert.throws(() => apply(closed, remove), /侧板/);
  state = apply(state, { type: 'board-remove' });
  state = apply(state, remove);
  assert.equal(state.ioShield, 'tray');
  assert.deepEqual(state.layout.ioShield, remove.pose);
  state = apply(state, { type: 'table-place', part: 'board', pose: CART_LAYOUT.board });
  assert.equal(canChangeStock(state, 'motherboard'), false);
  state = apply(state, { type: 'table-place', part: 'ioShield', pose: CART_LAYOUT.ioShield });
  const changed = changeStock(state, selection, 'motherboard', 'board-a4');
  assert.equal(changed.assembly.ioShield, 'tray');
  assert.equal(changeStock(state, selection, 'motherboard', null).assembly.ioShield, undefined);
});

test('old saves do not gain a shield; malformed new states are rejected', () => {
  const legacy = createRoomAssembly(selection);
  delete legacy.ioShield;
  delete legacy.layout.ioShield;
  validateRoomSelection(legacy, selection, listParts());
  for (const ioShield of [null, true, 'bad'])
    assert.throws(() => validateAssembly({ ...open(), ioShield }), /挡板/);
  assert.throws(() => validateAssembly({ ...legacy, ioShield: 'installed' }), /挡板/);
  assert.throws(
    () => apply(createRoomAssembly({ motherboard: 'board-a4' }), { type: 'io-shield-install' }),
    /机箱/,
  );
});

test('shield state and pose survive API persistence', async () => {
  const app = createApp({ dbPath: ':memory:' });
  try {
    const assembly = apply(open(), { type: 'io-shield-install' });
    const created = await app.inject({
      method: 'POST',
      url: '/api/builds',
      payload: { name: 'shield', selection, assembly },
    });
    assert.equal(created.statusCode, 201, created.body);
    const read = await app.inject({ method: 'GET', url: `/api/builds/${created.json().data.id}` });
    assert.deepEqual(read.json().data.assembly, assembly);
  } finally {
    await app.close();
  }
});

test('case I/O opening is actually open and the shield is a compact independent mesh', () => {
  const chassis = createCase(),
    shield = createIOShield();
  chassis.updateMatrixWorld(true);
  const ray = new THREE.Raycaster(new THREE.Vector3(-300, 63, -139), new THREE.Vector3(1, 0, 0));
  const hits = ray.intersectObject(chassis, true);
  assert.ok(
    hits.every((hit) => hit.point.x > -160),
    'case wall must not cover the I/O opening',
  );
  const size = new THREE.Box3().setFromObject(shield).getSize(new THREE.Vector3());
  assert.equal(size.y, 44);
  assert.equal(size.z, 148);
  for (const model of [chassis, shield])
    model.traverse((o) => {
      o.geometry?.dispose();
      o.material?.dispose();
    });
});

test('detailed AM5 board carries its I/O shield without a separate installation step', () => {
  const selected = { motherboard: 'board-a5', case: 'case-air' };
  const state = createRoomAssembly(selected);
  assert.equal(state.ioShield, undefined);
  assert.equal(state.layout.ioShield, undefined);
  const replacement = changeStock(
    createRoomAssembly(selection),
    selection,
    'motherboard',
    'board-a5',
  );
  assert.equal(replacement.assembly.ioShield, undefined);
});
