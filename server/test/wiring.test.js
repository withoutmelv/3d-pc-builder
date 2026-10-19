import test from 'node:test';
import assert from 'node:assert/strict';
import { createRoomAssembly } from '../../shared/room.js';
import { transitionAssembly as apply, validateAssembly } from '../../shared/assembly.js';
import { getWiring } from '../../shared/power-wiring.js';
import { CART_LAYOUT } from '../../shared/workbench-layout.js';
import { createApp } from '../src/app.js';
const selection = { case: 'case-air', motherboard: 'board-a5', gpu: 'gpu-dual', psu: 'psu-750' };
const plug = (state, kind, target = kind) =>
  apply(state, { type: 'cable-connect', cable: kind, target });
const unplug = (state, target) => apply(state, { type: 'cable-disconnect', target });
function mounted(fixed = false) {
  let state = createRoomAssembly(selection);
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
    { type: 'psu-place' },
    { type: 'gpu-open' },
    { type: 'gpu-place' },
  ])
    state = apply(state, action);
  if (fixed)
    for (let index = 0; index < 4; index++) {
      state = apply(state, { type: 'screw', index });
      state = apply(state, { type: 'psu-screw', index });
    }
  if (fixed) state = apply(state, { type: 'gpu-screw' });
  return state;
}
test('power cables connect in any order, including CPU power before CPU installation', () => {
  for (const order of [
    ['gpu', 'board', 'cpu'],
    ['cpu', 'gpu', 'board'],
    ['board', 'cpu', 'gpu'],
  ]) {
    const start = mounted();
    let state = start;
    for (const kind of order) state = plug(state, kind);
    assert.deepEqual(getWiring(state), { board: true, cpu: true, gpu: true });
    assert.deepEqual(getWiring(start), { board: false, cpu: false, gpu: false });
    assert.equal(state.cpu, 'tray');
    assert.throws(() => plug(state, 'cpu'), /已连接/);
    const removed = unplug(state, 'cpu');
    assert.deepEqual(getWiring(removed), { board: true, cpu: false, gpu: true });
  }
});
test('wrong plugs, absent receivers and a closed side panel reject wiring without changing state', () => {
  const state = mounted();
  assert.throws(() => plug(state, 'cpu', 'gpu'), /不匹配/);
  assert.throws(() => plug(state, 'bad', 'cpu'), /无效/);
  assert.throws(() => plug(createRoomAssembly(selection), 'board'), /侧板/);
  const closed = apply(state, { type: 'panel-close' });
  assert.throws(() => plug(closed, 'board'), /侧板/);
  const connected = apply(plug(state, 'board'), { type: 'panel-close' });
  assert.throws(() => unplug(connected, 'board'), /侧板/);
  let noGpu = apply(state, { type: 'gpu-open' });
  noGpu = apply(noGpu, { type: 'table-place', part: 'gpu', pose: CART_LAYOUT.gpu });
  assert.throws(() => plug(noGpu, 'gpu'), /安装显卡/);
  assert.throws(() => unplug(state, 'cpu'), /尚未连接/);
});
test('only connected components block removal; wired assemblies can be carried together', () => {
  let state = plug(plug(plug(mounted(), 'board'), 'cpu'), 'gpu');
  const move = (part) => ({ type: 'table-place', part, pose: CART_LAYOUT[part] });
  assert.throws(() => apply(state, move('board')), /供电线/);
  assert.throws(() => apply(state, move('psu')), /供电线/);
  state = apply(state, { type: 'gpu-open' });
  assert.throws(() => apply(state, move('gpu')), /供电线/);
  state = unplug(state, 'gpu');
  state = apply(state, move('gpu'));
  assert.deepEqual(getWiring(state), { board: true, cpu: true, gpu: false });
  state = unplug(unplug(state, 'cpu'), 'board');
  assert.equal(apply(state, move('psu')).power.placed, false);
  const fixed = plug(plug(plug(mounted(true), 'board'), 'cpu'), 'gpu');
  const moved = apply(fixed, {
    type: 'table-place',
    part: 'case',
    pose: { x: 0, z: 0, rotation: 90 },
  });
  assert.deepEqual(getWiring(moved), getWiring(fixed));
});
test('legacy saves default to unplugged and impossible wiring snapshots are rejected', () => {
  const legacy = mounted();
  delete legacy.wiring;
  validateAssembly(legacy);
  assert.deepEqual(getWiring(legacy), { board: false, cpu: false, gpu: false });
  assert.throws(
    () => validateAssembly({ ...legacy, wiring: { board: true, cpu: false } }),
    /接线状态/,
  );
  assert.throws(
    () => validateAssembly({ ...legacy, wiring: { board: 1, cpu: false, gpu: false } }),
    /接线状态/,
  );
  const empty = createRoomAssembly(selection);
  assert.throws(
    () => validateAssembly({ ...empty, wiring: { board: true, cpu: false, gpu: false } }),
    /电源和主板/,
  );
  assert.throws(
    () =>
      validateAssembly({
        ...legacy,
        graphics: { placed: false, latchOpen: false, screwed: false },
        wiring: { board: false, cpu: false, gpu: true },
      }),
    /显卡供电/,
  );
});
test('wired save and partial disconnect survive API reopen; invalid snapshot uses shared error code', async () => {
  const app = createApp({ dbPath: ':memory:' });
  try {
    const assembly = plug(plug(plug(mounted(true), 'board'), 'cpu'), 'gpu');
    let response = await app.inject({
      method: 'POST',
      url: '/api/builds',
      payload: { name: 'Wiring test', selection, assembly },
    });
    assert.equal(response.statusCode, 201, response.body);
    const id = response.json().data.id;
    const updated = unplug(assembly, 'gpu');
    response = await app.inject({
      method: 'PUT',
      url: `/api/builds/${id}`,
      payload: { name: 'Wiring test', selection, assembly: updated },
    });
    assert.equal(response.statusCode, 200, response.body);
    response = await app.inject({ method: 'GET', url: `/api/builds/${id}` });
    assert.deepEqual(response.json().data.assembly, updated);
    response = await app.inject({
      method: 'PUT',
      url: `/api/builds/${id}`,
      payload: {
        name: 'Wiring test',
        selection,
        assembly: { ...updated, power: { placed: false, screws: [false, false, false, false] } },
      },
    });
    assert.equal(response.statusCode, 400);
    assert.equal(response.json().code, 'VALIDATION_ERROR');
  } finally {
    await app.close();
  }
});
test('cable models follow moved cases, hide under panels and retain a small draw budget', async () => {
  const THREE = await import('three');
  const { createPowerCables } = await import('../../web/src/three/power-cables.js');
  const chassis = new THREE.Group(),
    board = new THREE.Group();
  chassis.add(board);
  board.position.set(-18, 43, -70);
  const model = createPowerCables(chassis, board);
  const camera = new THREE.PerspectiveCamera();
  camera.position.set(0, 640, 990);
  const state = plug(plug(plug(mounted(true), 'board'), 'cpu'), 'gpu');
  try {
    model.update(state, null, camera, null);
    let meshes = 0;
    chassis.traverse((o) => {
      if (o.isMesh) {
        meshes++;
        for (const v of o.geometry.attributes.position.array) assert.ok(Number.isFinite(v));
      }
    });
    assert.equal(meshes, 20);
    const before = model.plugs.cpu.getWorldPosition(new THREE.Vector3());
    chassis.position.x = 700;
    model.update(state, null, camera, null);
    const after = model.plugs.cpu.getWorldPosition(new THREE.Vector3());
    assert.ok(Math.abs(after.x - before.x - 700) < 0.001);
    const target = model.ports.cpu.localToWorld(new THREE.Vector3(0, 9, 0));
    assert.ok(after.distanceTo(target) < 0.001);
    model.update({ ...state, panelRemoved: false }, null, camera, null);
    assert.equal(model.root.visible, false);
    assert.ok(Object.values(model.ports).every((p) => !p.visible));
  } finally {
    const materials = new Set();
    chassis.traverse((o) => {
      o.geometry?.dispose();
      if (o.material) materials.add(o.material);
    });
    materials.forEach((m) => m.dispose());
  }
});
