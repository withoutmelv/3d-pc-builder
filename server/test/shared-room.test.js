import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createRoomAssembly,
  changeStock,
  canChangeStock,
  validateRoomSelection,
} from '../../shared/room.js';
import {
  createAssembly,
  KIT_SELECTION,
  transitionAssembly,
  validateAssembly,
} from '../../shared/assembly.js';
import { CART, CART_LAYOUT } from '../../shared/workbench-layout.js';
import { listParts } from '../src/service/parts.js';
import { createApp } from '../src/app.js';
const selection = { ...KIT_SELECTION, storage: 'ssd-2', gpu: 'gpu-dual', psu: 'psu-850' };
const catalogue = listParts();
test('a new room is empty; chosen parts appear only on the cart and never refill after moving', () => {
  const empty = createRoomAssembly();
  assert.deepEqual(empty.layout, {});
  assert.throws(() => transitionAssembly(empty, { type: 'socket-open' }), /主板/);
  const first = changeStock(empty, {}, 'cpu', 'cpu-a5');
  assert.deepEqual(Object.keys(first.assembly.layout), ['cpu']);
  assert.equal(first.assembly.layout.cpu.y, CART.y);
  const full = createRoomAssembly(selection);
  validateRoomSelection(full, selection, catalogue);
  const moved = transitionAssembly(full, {
    type: 'table-place',
    part: 'cpu',
    pose: { x: 0, z: 0, rotation: 180 },
  });
  const next = transitionAssembly(moved, { type: 'socket-open' });
  assert.equal(next.layout.cpu.y, undefined);
  assert.deepEqual(full.layout.cpu, CART_LAYOUT.cpu);
  assert.equal(canChangeStock(next, 'cpu'), false);
  assert.throws(() => changeStock(next, selection, 'cpu', 'cpu-a4'), /推车/);
  const returned = transitionAssembly(next, {
    type: 'table-place',
    part: 'cpu',
    pose: CART_LAYOUT.cpu,
  });
  const replaced = changeStock(returned, selection, 'cpu', 'cpu-a4');
  assert.equal(replaced.selection.cpu, 'cpu-a4');
  assert.equal(replaced.assembly.layout.cpu.y, CART.y);
});
test('assembled attachments prevent replacing their parent even when it is on the cart', () => {
  let state = createRoomAssembly(selection);
  for (const type of ['socket-open', 'cpu-place', 'cpu-lock'])
    state = transitionAssembly(state, { type });
  assert.equal(canChangeStock(state, 'motherboard'), false);
  assert.equal(canChangeStock(state, 'cpu'), false);
  assert.throws(() => changeStock(state, selection, 'motherboard', 'board-a4'), /推车/);
});
test('incompatible parts can be selected freely but are rejected at the installation point', () => {
  const chosen = { ...selection, cpu: 'cpu-a4' };
  let state = createRoomAssembly(chosen);
  validateRoomSelection(state, chosen, catalogue);
  state = transitionAssembly(state, { type: 'socket-open' });
  state = transitionAssembly(state, { type: 'cpu-place' });
  assert.throws(() => validateRoomSelection(state, chosen, catalogue), /插槽/);
  const invalid = createRoomAssembly({ cpu: 'cpu-a5' });
  invalid.cpu = 'seated';
  invalid.socketOpen = true;
  assert.throws(() => validateAssembly(invalid), /主板/);
});
test('cart support has boundaries and may not be used as a floor drop zone', () => {
  const state = createRoomAssembly(selection);
  assert.throws(
    () =>
      transitionAssembly(state, {
        type: 'table-place',
        part: 'cpu',
        pose: { x: 0, z: 0, y: CART.y, rotation: 0 },
      }),
    /边缘/,
  );
  assert.throws(
    () =>
      transitionAssembly(state, {
        type: 'table-place',
        part: 'cpu',
        pose: { x: CART.x, z: CART.z, y: -462, rotation: 0 },
      }),
    /推车/,
  );
  assert.throws(() => validateAssembly({ ...state, room: false }), /房间/);
  validateAssembly(createAssembly());
});
test('partial room selection, cart changes and moved positions persist on the same saved room', async () => {
  const app = createApp({ dbPath: ':memory:' });
  try {
    let data = { name: 'shared room test', selection: {}, assembly: createRoomAssembly() };
    let result = await app.inject({ method: 'POST', url: '/api/builds', payload: data });
    assert.equal(result.statusCode, 201, result.body);
    const id = result.json().data.id;
    data = { ...data, ...changeStock(data.assembly, data.selection, 'storage', 'ssd-1') };
    data.assembly = transitionAssembly(data.assembly, {
      type: 'table-place',
      part: 'storage',
      pose: { x: 0, z: 100, rotation: 90 },
    });
    result = await app.inject({ method: 'PUT', url: `/api/builds/${id}`, payload: data });
    assert.equal(result.statusCode, 200, result.body);
    data.assembly = transitionAssembly(data.assembly, {
      type: 'table-place',
      part: 'storage',
      pose: CART_LAYOUT.storage,
    });
    data = { ...data, ...changeStock(data.assembly, data.selection, 'storage', 'ssd-2') };
    result = await app.inject({ method: 'PUT', url: `/api/builds/${id}`, payload: data });
    assert.equal(result.statusCode, 200, result.body);
    const restored = (await app.inject({ method: 'GET', url: `/api/builds/${id}` })).json().data;
    assert.deepEqual(restored.assembly, data.assembly);
    assert.deepEqual(restored.selection, data.selection);
    result = await app.inject({
      method: 'PUT',
      url: `/api/builds/${id}`,
      payload: { ...data, selection: {} },
    });
    assert.equal(result.statusCode, 400);
  } finally {
    await app.close();
  }
});
