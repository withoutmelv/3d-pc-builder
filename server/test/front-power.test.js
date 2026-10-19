import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createRoomAssembly, canChangeStock } from '../../shared/room.js';
import { transitionAssembly as apply, validateAssembly } from '../../shared/assembly.js';
import { getCableConnections } from '../../shared/power-wiring.js';
import { createPowerCables } from '../../web/src/three/power-cables.js';
import { createApp } from '../src/app.js';
const selection = { motherboard: 'board-a5', case: 'case-air' };
const connect = { type: 'cable-connect', cable: 'frontPower', target: 'frontPower' };
const disconnect = { type: 'cable-disconnect', target: 'frontPower' };
const open = () =>
  apply(createRoomAssembly(selection), {
    type: 'table-place',
    part: 'panel',
    pose: { x: 500, z: 0, rotation: 0 },
  });
test('case power button connects without PSU or CPU and only blocks moving connected owners', () => {
  const original = open();
  const connected = apply(original, connect);
  assert.equal(connected.frontPower, true);
  assert.equal(original.frontPower, undefined);
  assert.equal(connected.cpu, 'tray');
  assert.equal(connected.power.placed, false);
  for (const part of ['board', 'case'])
    assert.throws(
      () => apply(connected, { type: 'table-place', part, pose: { x: 0, z: 0, rotation: 0 } }),
      /POWER SW/,
    );
  assert.throws(() => apply(connected, { type: 'board-to-case' }), /POWER SW/);
  assert.equal(canChangeStock(connected, 'motherboard'), false);
  const released = apply(connected, disconnect);
  assert.equal(released.frontPower, false);
  let mounted = apply(released, { type: 'board-to-case' });
  for (let index = 0; index < 4; index++) mounted = apply(mounted, { type: 'screw', index });
  mounted = apply(mounted, connect);
  assert.equal(
    apply(mounted, { type: 'table-place', part: 'case', pose: { x: 0, z: 0, rotation: 0 } })
      .frontPower,
    true,
  );
});
test('power switch rejects incorrect connectors, missing owners and inaccessible wiring', () => {
  assert.throws(() => apply(createRoomAssembly(selection), connect), /侧板/);
  for (const target of ['board', 'cpu', 'gpu']) {
    assert.throws(() => apply(open(), { ...connect, target }), /接口不匹配/);
    assert.throws(() => apply(open(), { ...connect, cable: target }), /接口不匹配/);
  }
  assert.throws(() => apply(createRoomAssembly({}), connect), /机箱和主板/);
  assert.throws(() => apply(open(), disconnect), /尚未连接/);
  assert.throws(() => apply(apply(open(), connect), connect), /已连接/);
  assert.throws(
    () => apply(apply(apply(open(), connect), { type: 'panel-close' }), disconnect),
    /侧板/,
  );
  assert.throws(() => validateAssembly({ ...open(), frontPower: 'yes' }), /状态/);
  assert.throws(
    () => validateAssembly({ ...createRoomAssembly({}), frontPower: true }),
    /机箱和主板/,
  );
  assert.equal(getCableConnections(open()).frontPower, false);
});
test('power switch wire appears without PSU and follows the external motherboard socket', () => {
  const chassis = new THREE.Group(),
    board = new THREE.Group(),
    scene = new THREE.Scene();
  scene.add(chassis, board);
  board.position.set(-350, 0, 0);
  const model = createPowerCables(chassis, board);
  const camera = new THREE.PerspectiveCamera();
  try {
    model.update(open(), null, camera, null);
    assert.equal(model.root.visible, true);
    assert.equal(model.plugs.frontPower.visible, true);
    assert.equal(model.plugs.cpu.visible, false);
    assert.equal(model.ports.frontPower.visible, true);
    model.update(apply(open(), connect), null, camera, null);
    const end = model.plugs.frontPower.getWorldPosition(new THREE.Vector3());
    assert.ok(
      end.distanceTo(model.ports.frontPower.localToWorld(new THREE.Vector3(0, 9, 0))) < 0.001,
    );
    model.update({ ...open(), panelRemoved: false }, null, camera, null);
    assert.equal(model.root.visible, false);
  } finally {
    scene.traverse((o) => {
      o.geometry?.dispose();
      o.material?.dispose();
    });
  }
});
test('power switch connection survives API persistence', async () => {
  const app = createApp({ dbPath: ':memory:' });
  try {
    const assembly = apply(open(), connect);
    const r = await app.inject({
      method: 'POST',
      url: '/api/builds',
      payload: { name: 'power switch', selection, assembly },
    });
    assert.equal(r.statusCode, 201, r.body);
    const read = await app.inject({ method: 'GET', url: `/api/builds/${r.json().data.id}` });
    assert.deepEqual(read.json().data.assembly, assembly);
  } finally {
    await app.close();
  }
});
