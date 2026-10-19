import { mountReady } from './helpers/mounting.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  createAssembly,
  getCoolerFans,
  getFanConnections,
  transitionAssembly as apply,
  validateAssembly,
} from '../../shared/assembly.js';
import {
  createRoomAssembly,
  canChangeStock,
  changeStock,
  validateRoomSelection,
} from '../../shared/room.js';
import { CART_LAYOUT, FLOOR_Y } from '../../shared/workbench-layout.js';
import { createCooler, createCoolerFan } from '../../web/src/three/workbench-models.js';
import { createApp } from '../src/app.js';
import { listParts } from '../src/service/parts.js';

const selection = {
  motherboard: 'board-a5',
  cpu: 'cpu-a5',
  cooler: 'cooler-air',
  case: 'case-air',
};
const step = (s, type, index) => apply(s, { type, index });
const attachFans = (s) =>
  [1, 0].reduce((state, i) => step(step(state, 'cooler-fan-place', i), 'cooler-fan-clip', i), s);
const tower = () =>
  ['socket-open', 'cpu-place', 'cpu-lock', 'paste-apply', 'cooler-place'].reduce(
    (s, type) => step(s, type),
    mountReady(createRoomAssembly(selection)),
  );

test('new cooler has two loose fans; either side can be attached on the cart before CPU or tower installation', () => {
  const initial = createRoomAssembly(selection);
  assert.deepEqual(getCoolerFans(initial), ['tray', 'tray']);
  assert.deepEqual(initial.layout.coolerFan0, CART_LAYOUT.coolerFan0);
  const frozen = structuredClone(initial);
  const attached = attachFans(initial);
  assert.deepEqual(initial, frozen);
  assert.deepEqual(getCoolerFans(attached), ['locked', 'locked']);
  assert.equal(attached.cpu, 'tray');
  const moved = apply(attached, {
    type: 'table-place',
    part: 'cooler',
    pose: { x: -250, z: -425, rotation: 90 },
  });
  assert.deepEqual(getCoolerFans(moved), ['locked', 'locked']);
  validateRoomSelection(moved, selection, listParts());
});

test('unclipped fans block carrying their assembly, but unrelated parts remain free', () => {
  let s = step(createRoomAssembly(selection), 'cooler-fan-place', 0);
  assert.throws(
    () =>
      apply(s, { type: 'table-place', part: 'cooler', pose: { x: -250, z: -425, rotation: 0 } }),
    /扣紧/,
  );
  assert.doesNotThrow(() => step(s, 'board-to-bench'));
  s = step(tower(), 'cooler-fan-place', 1);
  s = step(step(s, 'cooler-screw', 0), 'cooler-screw', 1);
  assert.throws(() => step(s, 'board-to-bench'), /固定/);
  assert.throws(() => step(s, 'fan-connect'), /两侧风扇/);
  s = step(s, 'cooler-fan-clip', 1);
  assert.doesNotThrow(() => step(s, 'board-to-bench'));
});

test('fan cable prevents unclipping; either fan can then be removed and placed freely', () => {
  let s = attachFans(tower());
  s = step(step(s, 'cooler-screw', 0), 'cooler-screw', 1);
  s = step(s, 'fan-connect');
  assert.throws(() => step(s, 'cooler-fan-unclip', 0), /拔下/);
  s = step(s, 'fan-disconnect');
  assert.throws(
    () => apply(s, { type: 'table-place', part: 'coolerFan0', pose: CART_LAYOUT.coolerFan0 }),
    /钢丝扣/,
  );
  s = step(s, 'cooler-fan-unclip', 0);
  const pose = { x: 1300, z: 1100, y: FLOOR_Y, rotation: 90 };
  s = apply(s, { type: 'table-place', part: 'coolerFan0', pose });
  assert.deepEqual(getCoolerFans(s), ['tray', 'locked']);
  assert.deepEqual(s.layout.coolerFan0, pose);
  assert.equal(s.cooling.placed, true);
  assert.throws(
    () => apply(s, { type: 'table-place', part: 'coolerFan0', pose: s.layout.board }),
    /重叠|位置/,
  );
});

test('closed case blocks attached fan work, while an unattached cooler remains accessible', () => {
  let s = attachFans(tower());
  s = step(step(s, 'cooler-screw', 0), 'cooler-screw', 1);
  s = apply(s, { type: 'table-place', part: 'panel', pose: { x: 0, z: 0, rotation: 0 } });
  for (const type of ['board-to-case', 'panel-close']) s = step(s, type);
  assert.throws(() => step(s, 'cooler-fan-unclip', 1), /侧板/);
  let separate = createRoomAssembly(selection);
  separate = apply(separate, {
    type: 'table-place',
    part: 'panel',
    pose: { x: 0, z: 0, rotation: 0 },
  });
  for (const type of ['board-to-case', 'panel-close']) separate = step(separate, type);
  assert.doesNotThrow(() => step(separate, 'cooler-fan-place', 0));
});

test('stock replacement includes both fans and refuses to orphan a moved or attached fan', () => {
  let s = createRoomAssembly(selection);
  assert.equal(canChangeStock(s, 'cooler'), true);
  s = step(s, 'cooler-fan-place', 0);
  assert.equal(canChangeStock(s, 'cooler'), false);
  s = apply(s, { type: 'table-place', part: 'coolerFan0', pose: CART_LAYOUT.coolerFan0 });
  assert.equal(canChangeStock(s, 'cooler'), true);
  const removed = changeStock(s, selection, 'cooler', null);
  assert.equal(removed.assembly.coolerFans, undefined);
  assert.equal(removed.assembly.layout.coolerFan0, undefined);
  validateRoomSelection(removed.assembly, removed.selection, listParts());
});

test('legacy coolers keep attached fans; detaching one materializes only necessary new state', () => {
  let s = createAssembly();
  assert.deepEqual(getCoolerFans(s), ['locked', 'locked']);
  s = step(s, 'cooler-fan-unclip', 1);
  s = apply(s, {
    type: 'table-place',
    part: 'coolerFan1',
    pose: { x: -150, z: -425, rotation: 0 },
  });
  assert.deepEqual(getCoolerFans(s), ['locked', 'tray']);
  validateAssembly(s);
  for (const coolerFans of [null, [], ['bad', 'locked']])
    assert.throws(() => validateAssembly({ ...createAssembly(), coolerFans }));
  assert.throws(() => step(createRoomAssembly(), 'cooler-fan-place', 0), /散热器/);
  assert.throws(() => step(createRoomAssembly(selection), 'cooler-fan-clip', 0), /贴到/);
});

test('loose fan placement and clipped side survive API reopen', async () => {
  const app = createApp({ dbPath: ':memory:' });
  try {
    let assembly = createRoomAssembly(selection);
    assembly = step(step(assembly, 'cooler-fan-place', 1), 'cooler-fan-clip', 1);
    assembly = apply(assembly, {
      type: 'table-place',
      part: 'coolerFan0',
      pose: { x: -350, z: -425, rotation: 90 },
    });
    const res = await app.inject({
      method: 'POST',
      url: '/api/builds',
      payload: { name: 'fan-test', selection, assembly },
    });
    assert.equal(res.statusCode, 201, res.body);
    const read = await app.inject({ method: 'GET', url: `/api/builds/${res.json().data.id}` });
    assert.deepEqual(read.json().data.assembly, assembly);
  } finally {
    await app.close();
  }
});

test('tower and fan models are separate with compact geometry and independently moving clips', () => {
  const body = createCooler(false);
  const fan = createCoolerFan();
  const clips = fan.userData.clips;
  assert.equal(clips.parent, fan);
  const bounds = new THREE.Box3().setFromObject(body).getSize(new THREE.Vector3());
  assert.equal(bounds.z, 70);
  let meshes = 0;
  fan.traverse((o) => {
    if (o.isMesh) {
      meshes++;
      assert.ok(o.geometry.attributes.position.count > 0);
    }
  });
  assert.ok(meshes <= 5);
  clips.position.x = 10;
  assert.equal(fan.position.x, 0);
});

test('fan outlet struts face rear I/O rather than the memory slots', () => {
  const fan = createCoolerFan();
  const shell = fan.children.find((child) => child !== fan.userData.clips);
  const bounds = new THREE.Box3().setFromObject(shell);
  // Frame ends at +/-6; the outlet motor struts project to 8 on the I/O side.
  assert.ok(Math.abs(bounds.min.x + 8) < 0.01);
  assert.ok(Math.abs(bounds.max.x - 6) < 0.01);
  fan.traverse((object) => {
    object.geometry?.dispose();
    object.material?.dispose();
  });
});

test('one fan can connect before tower screws are finished without locking the other fan', () => {
  for (const i of [0, 1]) {
    let s = step(step(tower(), 'cooler-fan-place', i), 'cooler-fan-clip', i);
    const original = structuredClone(s);
    s = step(s, 'fan-connect', i);
    assert.deepEqual(getFanConnections(s), [i === 0, i === 1]);
    assert.deepEqual(getFanConnections(original), [false, false]);
    assert.throws(() => step(s, 'fan-connect', i), /已经/);
    assert.throws(() => step(s, 'cooler-fan-unclip', i), /拔下/);
    s = step(step(s, 'cooler-fan-place', 1 - i), 'cooler-fan-clip', 1 - i);
    s = step(s, 'cooler-fan-unclip', 1 - i);
    s = apply(s, {
      type: 'table-place',
      part: `coolerFan${1 - i}`,
      pose: CART_LAYOUT[`coolerFan${1 - i}`],
    });
    assert.equal(getFanConnections(s)[i], true);
    s = step(s, 'cooler-screw-step', 0);
    s = step(s, 'cooler-unscrew', 0);
    assert.throws(
      () =>
        apply(s, { type: 'table-place', part: 'cooler', pose: { x: -250, z: -425, rotation: 0 } }),
      /拔下/,
    );
    s = step(s, 'fan-disconnect', i);
    assert.equal(s.cooling.fanConnected, false);
    assert.doesNotThrow(() => step(s, 'cooler-fan-unclip', i));
  }
});

test('independent wires preserve legacy group actions and reject inconsistent saved state', () => {
  let s = attachFans(tower());
  s = step(s, 'fan-connect');
  assert.deepEqual(getFanConnections(s), [true, true]);
  const legacy = structuredClone(s);
  delete legacy.fanConnections;
  validateAssembly(legacy);
  assert.deepEqual(getFanConnections(legacy), [true, true]);
  s = step(legacy, 'fan-disconnect', 0);
  assert.deepEqual(getFanConnections(s), [false, true]);
  assert.equal(s.cooling.fanConnected, true);
  assert.deepEqual(getFanConnections(step(s, 'fan-disconnect')), [false, false]);
  for (const fanConnections of [null, [], [true, 'yes'], [false, false]])
    assert.throws(() => validateAssembly({ ...s, fanConnections }), /接线/);
  assert.throws(() => step(s, 'fan-connect', 2), /位置/);
  assert.throws(() => step(tower(), 'fan-connect', 0), /扣紧/);
});

test('independent fan wiring survives API save and reopen', async () => {
  const app = createApp({ dbPath: ':memory:' });
  try {
    const assembly = step(
      step(step(tower(), 'cooler-fan-place', 1), 'cooler-fan-clip', 1),
      'fan-connect',
      1,
    );
    const res = await app.inject({
      method: 'POST',
      url: '/api/builds',
      payload: { name: 'single fan wiring', selection, assembly },
    });
    assert.equal(res.statusCode, 201, res.body);
    const read = await app.inject({ method: 'GET', url: `/api/builds/${res.json().data.id}` });
    assert.deepEqual(read.json().data.assembly, assembly);
  } finally {
    await app.close();
  }
});
