import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createRoomAssembly } from '../../shared/room.js';
import { transitionAssembly as apply, validateAssembly } from '../../shared/assembly.js';
import { createCase } from '../../web/src/three/workbench-models.js';
import { createApp } from '../src/app.js';
const selection = { motherboard: 'board-a5', case: 'case-air', gpu: 'gpu-dual' };
const open = () =>
  apply(createRoomAssembly(selection), {
    type: 'table-place',
    part: 'panel',
    pose: { x: 500, z: 0, rotation: 0 },
  });
const remove = (state, index) =>
  apply(apply(state, { type: 'slot-cover-unscrew', index }), {
    type: 'table-place',
    part: `slotCover${index}`,
    pose: { x: -840 + index * 40, z: 350, rotation: 0 },
  });
test('covers block only GPU entry, including a board with a preinstalled GPU', () => {
  const original = open();
  const gpu = apply(apply(original, { type: 'gpu-open' }), { type: 'gpu-place' });
  assert.throws(() => apply(gpu, { type: 'board-to-case' }), /槽位挡板/);
  let state = remove(gpu, 1);
  assert.throws(() => apply(state, { type: 'board-to-case' }), /槽位挡板/);
  state = remove(state, 0);
  state = apply(state, { type: 'board-to-case' });
  assert.equal(state.cpu, 'tray');
  assert.deepEqual(original.slotCovers, ['locked', 'locked']);
  assert.throws(() => apply(state, { type: 'slot-cover-place', index: 0 }), /显卡占用/);
  const board = apply(original, { type: 'board-to-case' });
  assert.throws(() => apply(apply(board, { type: 'gpu-open' }), { type: 'gpu-place' }), /槽位挡板/);
});
test('covers require unscrewing, support loose placement and reinstall in either order', () => {
  assert.throws(
    () => apply(createRoomAssembly(selection), { type: 'slot-cover-unscrew', index: 0 }),
    /侧板/,
  );
  assert.throws(
    () =>
      apply(open(), {
        type: 'table-place',
        part: 'slotCover0',
        pose: { x: -800, z: 400, rotation: 0 },
      }),
    /螺丝/,
  );
  const loose = apply(open(), { type: 'slot-cover-unscrew', index: 0 });
  assert.throws(
    () => apply(loose, { type: 'table-place', part: 'case', pose: { x: 0, z: 0, rotation: 0 } }),
    /挡板尚未固定/,
  );
  let state = remove(remove(open(), 1), 0);
  for (const index of [1, 0]) {
    state = apply(state, { type: 'slot-cover-place', index });
    state = apply(state, { type: 'slot-cover-screw', index });
  }
  assert.deepEqual(state.slotCovers, ['locked', 'locked']);
  assert.throws(() => apply(state, { type: 'slot-cover-unscrew', index: 2 }), /位置/);
  const legacy = open();
  delete legacy.slotCovers;
  delete legacy.layout.slotCover0;
  delete legacy.layout.slotCover1;
  validateAssembly(
    apply(apply(apply(legacy, { type: 'gpu-open' }), { type: 'gpu-place' }), {
      type: 'board-to-case',
    }),
  );
  assert.throws(() => validateAssembly({ ...state, slotCovers: ['bad', 'locked'] }), /挡板/);
});
test('case GPU opening is not covered by the static wall', () => {
  const chassis = createCase({ slotCovers: false });
  chassis.updateMatrixWorld(true);
  for (const y of [53, 79, 90]) {
    const ray = new THREE.Raycaster(new THREE.Vector3(-300, y, 0), new THREE.Vector3(1, 0, 0));
    assert.ok(ray.intersectObject(chassis, true).every((hit) => hit.point.x > -160));
  }
  chassis.traverse((o) => {
    o.geometry?.dispose();
    o.material?.dispose();
  });
});
test('removed cover poses survive API storage', async () => {
  const app = createApp({ dbPath: ':memory:' });
  try {
    const assembly = remove(open(), 0);
    const r = await app.inject({
      method: 'POST',
      url: '/api/builds',
      payload: { name: 'covers', selection, assembly },
    });
    assert.equal(r.statusCode, 201, r.body);
    const read = await app.inject({ method: 'GET', url: `/api/builds/${r.json().data.id}` });
    assert.deepEqual(read.json().data.assembly, assembly);
  } finally {
    await app.close();
  }
});
