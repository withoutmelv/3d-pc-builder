import test from 'node:test';
import assert from 'node:assert/strict';
import { createRoomAssembly, changeStock, validateRoomSelection } from '../../shared/room.js';
import { availableStock } from '../../shared/stock-catalogue.js';
import { openPackage, unpackPackage } from '../../shared/unpacking.js';
import { transitionAssembly as apply, validateAssembly } from '../../shared/assembly.js';
import { PACKAGES, isPacked } from '../../shared/packages.js';
import { listParts, resolveSelection } from '../src/service/parts.js';
import { evaluateParts } from '../src/service/compatibility.js';
import { createApp } from '../src/app.js';
const catalogue = listParts();
const boxed = () => createRoomAssembly(availableStock, { boxed: true });
const moveBox = (state, category, pose = { x: 0, z: 0, rotation: 0 }) =>
  apply(state, { type: 'table-place', part: `package-${category}`, pose });

test('every package may be opened and unpacked first; parts appear beside that box', () => {
  for (const category of Object.keys(PACKAGES)) {
    const initial = boxed();
    const moved = moveBox(initial, category);
    const opened = openPackage(moved, category);
    const unpacked = unpackPackage(opened, category);
    validateRoomSelection(unpacked, availableStock, catalogue);
    assert.equal(initial.packages[category], 'closed');
    assert.equal(unpacked.packages[category], 'empty');
    const primary = PACKAGES[category].parts[0];
    assert.equal(isPacked(unpacked, primary), false);
    assert.equal(unpacked.layout[primary].y, 0);
    assert.ok(Math.hypot(unpacked.layout[primary].x, unpacked.layout[primary].z) < 1900);
    assert.ok(
      Object.entries(unpacked.packages).every(
        ([key, status]) => key === category || status === 'closed',
      ),
    );
  }
});

test('closed boxes block extracting or operating on hidden contents, with no state mutation', () => {
  const s = boxed(),
    original = structuredClone(s);
  assert.throws(() => unpackPackage(s, 'cpu'), /先打开/);
  assert.throws(() => apply(s, { type: 'socket-open' }), /开盒/);
  assert.throws(
    () => apply(s, { type: 'table-place', part: 'cpu', pose: { x: 0, z: 0, rotation: 0 } }),
    /开盒/,
  );
  assert.throws(
    () => validateAssembly({ ...s, packages: { ...s.packages, cpu: 'invalid' } }),
    /包装/,
  );
  assert.deepEqual(s, original);
});

test('boxes retain contents while moving and rotating, and empty boxes remain movable', () => {
  let s = moveBox(boxed(), 'memory', { x: 0, z: 0, rotation: 90 });
  s = openPackage(s, 'memory');
  s = moveBox(s, 'memory', { x: 100, z: 0, rotation: 180 });
  s = unpackPackage(s, 'memory');
  assert.ok(s.layout.memory0 && s.layout.memory1);
  assert.equal(s.memory[0], 'tray');
  assert.equal(s.layout.memory0.rotation, 180);
  s = moveBox(s, 'memory', { x: 1300, z: 0, y: -462, rotation: 270 });
  assert.equal(s.packages.memory, 'empty');
  assert.equal(s.layout.memory0.y, 0);
});

test('boxed stock can be selected incrementally and removed without leaving orphan boxes', () => {
  let assembly = createRoomAssembly({}, { boxed: true }),
    selection = {};
  for (const [category, id] of Object.entries(availableStock))
    ({ assembly, selection } = changeStock(assembly, selection, category, id));
  validateRoomSelection(assembly, selection, catalogue);
  const removed = changeStock(assembly, selection, 'cpu', null);
  assert.equal(removed.assembly.layout['package-cpu'], undefined);
  assert.equal(removed.assembly.packages.cpu, undefined);
  assert.equal(removed.assembly.layout.cpu, undefined);
  assert.equal(createRoomAssembly(availableStock).packages, undefined);
});

test('API round-trips unopened, open and unpacked boxes', async () => {
  const app = createApp({ dbPath: ':memory:' });
  try {
    let s = openPackage(moveBox(boxed(), 'cpu'), 'cpu');
    const response = await app.inject({
      method: 'POST',
      url: '/api/builds',
      payload: { name: '拆箱存档', selection: availableStock, assembly: s },
    });
    assert.equal(response.statusCode, 201, response.body);
    const url = '/api/builds/' + response.json().data.id;
    const restored = (await app.inject({ method: 'GET', url })).json().data.assembly;
    assert.deepEqual(restored, s);
    s = unpackPackage(restored, 'cpu');
    const updated = await app.inject({
      method: 'PUT',
      url,
      payload: { name: '已取出', selection: availableStock, assembly: s },
    });
    assert.equal(updated.statusCode, 200, updated.body);
    assert.deepEqual(updated.json().data.assembly, s);
  } finally {
    await app.close();
  }
});

test('calibrated catalogue uses actual identities and explicit unknown prices', () => {
  const parts = resolveSelection(availableStock);
  assert.equal(parts.gpu.specs.length, 342);
  assert.equal(parts.psu.specs.wattage, 1000);
  assert.equal(parts.case.specs.maxGpuLength, 392);
  assert.equal(parts.cooler.specs.height, 154);
  assert.equal(evaluateParts(parts).total, null);
  assert.equal(evaluateParts(parts).conflicts, 0);
  for (const [category, field, limit, code] of [
    ['gpu', 'length', 392, 'GPU_LENGTH'],
    ['cooler', 'height', 180.5, 'COOLER_HEIGHT'],
  ]) {
    for (const [value, expected] of [
      [limit, 'pass'],
      [limit + 0.1, 'conflict'],
    ]) {
      const changed = {
        ...parts,
        [category]: { ...parts[category], specs: { ...parts[category].specs, [field]: value } },
      };
      assert.equal(evaluateParts(changed).checks.find((c) => c.code === code).status, expected);
    }
  }
});

test('insufficient unpacking space leaves the open box and all its contents unchanged', () => {
  const state = openPackage(boxed(), 'case');
  const before = structuredClone(state);
  assert.throws(() => unpackPackage(state, 'case'), /空间不足/);
  assert.deepEqual(state, before);
});

test('individual memory modules leave the box independently and can install directly', () => {
  let s = openPackage(boxed(), 'motherboard');
  s = apply(s, {
    type: 'table-place',
    part: 'board',
    unpack: 'board',
    pose: { x: -400, z: 0, rotation: 0 },
  });
  s = openPackage(s, 'memory');
  s = apply(s, { type: 'memory-open', index: 0 });
  const before = structuredClone(s);
  s = apply(s, { type: 'memory-place', index: 0, partIndex: 1, unpack: 'memory1' });
  assert.equal(s.memory[1], 'seated');
  assert.equal(s.packages.memory, 'open');
  assert.equal(isPacked(s, 'memory0'), true);
  assert.equal(isPacked(s, 'memory1'), false);
  assert.equal(isPacked(before, 'memory1'), true);
  s = apply(s, {
    type: 'table-place',
    part: 'memory0',
    unpack: 'memory0',
    pose: { x: 200, z: 0, rotation: 180 },
  });
  assert.equal(s.packages.memory, 'empty');
  validateRoomSelection(s, availableStock, catalogue);
});

test('individual extraction is atomic on collision and on invalid installation', () => {
  const s = openPackage(boxed(), 'cpu'),
    before = structuredClone(s);
  assert.throws(
    () =>
      apply(s, {
        type: 'table-place',
        part: 'cpu',
        unpack: 'cpu',
        pose: { ...s.layout['package-cpu'] },
      }),
    /重叠/,
  );
  assert.throws(() => apply(s, { type: 'cpu-place', unpack: 'cpu' }));
  assert.deepEqual(s, before);
  assert.equal(isPacked(s, 'cpu'), true);
});

test('cooler fan and rails can leave first while cooler body stays boxed', () => {
  let s = openPackage(boxed(), 'cooler');
  for (const [index, part] of ['coolerFan1', 'coolerMount0', 'cooler'].entries())
    s = apply(s, {
      type: 'table-place',
      part,
      unpack: part,
      pose: { x: -300 + index * 230, z: 0, rotation: 180 },
    });
  assert.equal(isPacked(s, 'coolerFan0'), true);
  assert.equal(isPacked(s, 'coolerMount1'), true);
  assert.equal(isPacked(s, 'cooler'), false);
  assert.equal(s.packages.cooler, 'open');
  validateRoomSelection(s, availableStock, catalogue);
  assert.throws(() => validateAssembly({ ...s, unpackedParts: ['unknown'] }), /拆箱/);
});

test('API preserves partial extraction and reopening does not restore the removed item', async () => {
  const app = createApp({ dbPath: ':memory:' });
  try {
    const assembly = apply(openPackage(boxed(), 'memory'), {
      type: 'table-place',
      part: 'memory1',
      unpack: 'memory1',
      pose: { x: 0, z: 0, rotation: 180 },
    });
    const created = await app.inject({
      method: 'POST',
      url: '/api/builds',
      payload: { name: 'Partial box', selection: availableStock, assembly },
    });
    assert.equal(created.statusCode, 201, created.body);
    const read = await app.inject({ method: 'GET', url: '/api/builds/' + created.json().data.id });
    const restored = read.json().data.assembly;
    assert.deepEqual(restored, assembly);
    assert.equal(isPacked(restored, 'memory0'), true);
    assert.equal(isPacked(restored, 'memory1'), false);
  } finally {
    await app.close();
  }
});
