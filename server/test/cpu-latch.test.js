import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createAssembly,
  getSocketLeverOpen,
  transitionAssembly as apply,
  validateAssembly,
} from '../../shared/assembly.js';
import { createRoomAssembly, changeStock } from '../../shared/room.js';
import { createApp } from '../src/app.js';

const sequence = [
  'socket-lever-open',
  'socket-cover-open',
  'cpu-place',
  'socket-cover-close',
  'socket-lever-lock',
];
const install = (state = createAssembly()) =>
  sequence.reduce((s, type) => apply(s, { type }), state);

test('CPU cover and lever operate independently; a closed cover does not lock the CPU', () => {
  let state = createAssembly();
  const before = structuredClone(state);
  state = apply(state, { type: 'socket-lever-open' });
  assert.equal(state.socketOpen, false);
  assert.equal(getSocketLeverOpen(state), true);
  assert.deepEqual(before, createAssembly());
  assert.throws(() => apply(state, { type: 'cpu-place' }), /压盖/);
  state = apply(state, { type: 'socket-cover-open' });
  assert.throws(() => apply(state, { type: 'socket-lever-lock' }), /合上/);
  state = apply(state, { type: 'cpu-place' });
  state = apply(state, { type: 'socket-cover-close' });
  assert.equal(state.cpu, 'seated');
  assert.equal(state.socketOpen, false);
  assert.equal(getSocketLeverOpen(state), true);
  assert.throws(() => apply(state, { type: 'paste-apply' }), /锁定/);
  assert.throws(() => apply(state, { type: 'board-to-bench' }), /尚未锁定/);
  assert.throws(() => apply(state, { type: 'cpu-remove' }), /压盖/);
  assert.throws(
    () => apply(state, { type: 'table-place', part: 'cpu', pose: state.layout.cpu }),
    /压盖/,
  );
  state = apply(state, { type: 'socket-lever-lock' });
  assert.equal(state.cpu, 'locked');
  assert.equal(getSocketLeverOpen(state), false);
  assert.equal(state.memory[0], 'tray');
  assert.doesNotThrow(() => apply(state, { type: 'paste-apply' }));
  assert.doesNotThrow(() => apply(state, { type: 'board-to-bench' }));
});

test('CPU can be unlocked and removed without bypassing the closed cover', () => {
  let state = install();
  assert.throws(() => apply(state, { type: 'socket-cover-open' }), /释放/);
  state = apply(state, { type: 'socket-lever-open' });
  assert.equal(state.cpu, 'seated');
  assert.throws(() => apply(state, { type: 'cpu-remove' }), /压盖/);
  state = apply(state, { type: 'socket-cover-open' });
  state = apply(state, { type: 'cpu-remove' });
  assert.equal(state.cpu, 'tray');
  state = apply(state, { type: 'socket-cover-close' });
  state = apply(state, { type: 'socket-lever-lock' });
  assert.equal(state.cpu, 'tray');
  assert.equal(state.socketOpen, false);
});

test('CPU latch rejects invalid states, repeated actions, cooler and side-panel obstruction', () => {
  const initial = createAssembly();
  for (const state of [
    { ...initial, socketLeverOpen: null },
    { ...initial, socketLeverOpen: 'open' },
    { ...initial, socketOpen: true, socketLeverOpen: false },
    { ...initial, cpu: 'locked', socketLeverOpen: true },
    { ...initial, cpu: 'seated', socketLeverOpen: false },
  ])
    assert.throws(() => validateAssembly(state));
  assert.throws(() => apply(initial, { type: 'socket-lever-lock' }), /扣紧/);
  const released = apply(initial, { type: 'socket-lever-open' });
  assert.throws(() => apply(released, { type: 'socket-lever-open' }), /已经释放/);
  let state = apply(install(), { type: 'paste-apply' });
  state = apply(state, { type: 'cooler-place' });
  assert.throws(() => apply(state, { type: 'socket-lever-open' }), /散热器/);
  state = apply(install(), { type: 'panel-remove' });
  state = apply(state, { type: 'board-to-case' });
  state = apply(state, { type: 'panel-close' });
  for (const type of sequence.filter((type) => type !== 'cpu-place'))
    assert.throws(() => apply(state, { type }), /侧板/);
});

test('legacy latch states and combined AM4 actions remain valid; replacing board resets the lever', () => {
  let state = createAssembly();
  state = apply(state, { type: 'socket-open' });
  state = apply(state, { type: 'cpu-place' });
  delete state.socketLeverOpen;
  assert.equal(getSocketLeverOpen(state), true);
  validateAssembly(state);
  state = apply(state, { type: 'socket-cover-close' });
  state = apply(state, { type: 'socket-lever-lock' });
  delete state.socketLeverOpen;
  assert.equal(getSocketLeverOpen(state), false);
  validateAssembly(state);
  state = apply(state, { type: 'socket-open' });
  state = apply(state, { type: 'cpu-lock' });
  assert.equal(state.cpu, 'locked');
  const selection = { motherboard: 'board-a5' };
  const room = apply(createRoomAssembly(selection), { type: 'socket-lever-open' });
  const changed = changeStock(room, selection, 'motherboard', 'board-a4');
  assert.equal(getSocketLeverOpen(changed.assembly), false);
  assert.throws(() => apply(createRoomAssembly(), { type: 'socket-lever-open' }), /主板/);
});

test('every CPU latch intermediate state survives save and reopen through the API', async () => {
  const app = createApp({ dbPath: ':memory:' });
  try {
    const selection = { motherboard: 'board-a5', cpu: 'cpu-a5' };
    let state = createRoomAssembly(selection);
    for (const type of sequence) {
      const original = structuredClone(state);
      const next = apply(state, { type });
      assert.deepEqual(state, original);
      state = next;
      const saved = await app.inject({
        method: 'POST',
        url: '/api/builds',
        payload: { name: type, selection, assembly: state },
      });
      assert.equal(saved.statusCode, 201, saved.body);
      const loaded = await app.inject({
        method: 'GET',
        url: `/api/builds/${saved.json().data.id}`,
      });
      assert.deepEqual(loaded.json().data.assembly, state);
    }
  } finally {
    await app.close();
  }
});

test('releasing and closing either latch preserves paste but still requires locking before cooler placement', () => {
  for (const modern of [false, true]) {
    const original = apply(install(), { type: 'paste-apply' });
    let state = apply(original, { type: modern ? 'socket-lever-open' : 'socket-open' });
    assert.equal(state.cooling.paste, true);
    assert.equal(original.cpu, 'locked');
    assert.throws(() => apply(state, { type: 'cooler-place' }), /锁定/);
    if (modern) {
      state = apply(state, { type: 'socket-cover-open' });
      state = apply(state, { type: 'socket-cover-close' });
    }
    state = apply(state, { type: modern ? 'socket-lever-lock' : 'cpu-lock' });
    assert.equal(state.cooling.paste, true);
    assert.doesNotThrow(() => apply(state, { type: 'cooler-place' }));
    assert.throws(() => apply(install(), { type: 'cooler-place' }), /硅脂/);
  }
});

test('paste stays with the removed CPU, while replacing or removing stock clears it immutably', () => {
  const selection = { motherboard: 'board-a5', cpu: 'cpu-a5' };
  let state = apply(install(createRoomAssembly(selection)), { type: 'paste-apply' });
  for (const type of ['socket-lever-open', 'socket-cover-open', 'cpu-remove'])
    state = apply(state, { type });
  assert.equal(state.cpu, 'tray');
  assert.equal(state.cooling.paste, true);
  validateAssembly(state);
  const reinserted = apply(state, { type: 'cpu-place' });
  assert.equal(reinserted.cooling.paste, true);
  for (const id of [null, 'cpu-a4']) {
    const next = changeStock(state, selection, 'cpu', id);
    assert.equal(next.assembly.cooling.paste, false);
    assert.equal(state.cooling.paste, true);
  }
  assert.throws(() => validateAssembly({ ...createRoomAssembly(), cooling: state.cooling }), /CPU/);
});

test('paste survives API restoration with an unlocked or removed CPU', async () => {
  const app = createApp({ dbPath: ':memory:' });
  try {
    const selection = { motherboard: 'board-a5', cpu: 'cpu-a5' };
    let assembly = apply(install(createRoomAssembly(selection)), { type: 'paste-apply' });
    for (const type of ['socket-lever-open', 'socket-cover-open', 'cpu-remove']) {
      assembly = apply(assembly, { type });
      const saved = await app.inject({
        method: 'POST',
        url: '/api/builds',
        payload: { name: 'paste persistence', selection, assembly },
      });
      assert.equal(saved.statusCode, 201, saved.body);
      const read = await app.inject({ method: 'GET', url: `/api/builds/${saved.json().data.id}` });
      assert.deepEqual(read.json().data.assembly, assembly);
    }
  } finally {
    await app.close();
  }
});
