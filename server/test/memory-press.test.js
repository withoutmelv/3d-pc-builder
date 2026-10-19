import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createAssembly,
  transitionAssembly as apply,
  validateAssembly,
} from '../../shared/assembly.js';
import { createRoomAssembly } from '../../shared/room.js';
import { createApp } from '../src/app.js';

test('pressing RAM locks the actual stick in either slot, before CPU installation', () => {
  for (const partIndex of [0, 1]) {
    for (const index of [0, 1]) {
      let state = apply(createAssembly(), { type: 'memory-open', index });
      state = apply(state, { type: 'memory-place', index, partIndex });
      const before = structuredClone(state);
      const pressed = apply(state, { type: 'memory-press', index });
      assert.deepEqual(state, before);
      assert.equal(pressed.memory[partIndex], 'locked');
      assert.equal(pressed.memory[1 - partIndex], 'tray');
      assert.equal(pressed.memorySlots[partIndex], index);
      assert.equal(pressed.memoryOpen[index], false);
      assert.equal(pressed.cpu, 'tray');
      validateAssembly(pressed);
      assert.throws(() => apply(state, { type: 'board-to-bench' }), /锁定/);
      assert.doesNotThrow(() => apply(pressed, { type: 'board-to-bench' }));
      assert.throws(() => apply(pressed, { type: 'memory-remove', index: partIndex }), /卡扣/);
      const released = apply(pressed, { type: 'memory-open', index });
      const removed = apply(released, { type: 'memory-remove', index: partIndex });
      assert.equal(removed.memory[partIndex], 'tray');
      assert.equal(removed.memorySlots[partIndex], null);
    }
  }
});

test('RAM pressing rejects an empty slot, repeated press, invalid slot, and a closed case', () => {
  let state = createAssembly();
  assert.throws(() => apply(state, { type: 'memory-press', index: 0 }), /放入插槽/);
  assert.throws(() => apply(state, { type: 'memory-press', index: 2 }));
  state = apply(state, { type: 'memory-open', index: 1 });
  assert.throws(() => apply(state, { type: 'memory-press', index: 1 }), /放入插槽/);
  state = apply(state, { type: 'memory-place', index: 1, partIndex: 0 });
  const pressed = apply(state, { type: 'memory-press', index: 1 });
  assert.throws(() => apply(pressed, { type: 'memory-press', index: 1 }), /已闭合/);
  state = apply(pressed, { type: 'panel-remove' });
  state = apply(state, { type: 'board-to-case' });
  state = apply(state, { type: 'memory-open', index: 1 });
  state = apply(state, { type: 'panel-close' });
  assert.throws(() => apply(state, { type: 'memory-press', index: 1 }), /侧板/);
});

test('legacy seated RAM can be pressed, and pressed RAM survives API storage', async () => {
  const legacy = createAssembly();
  delete legacy.memorySlots;
  legacy.memory[1] = 'seated';
  legacy.memoryOpen[1] = true;
  assert.equal(apply(legacy, { type: 'memory-press', index: 1 }).memory[1], 'locked');

  const selection = { motherboard: 'board-a5', memory: 'ram-d5' };
  let assembly = createRoomAssembly(selection);
  for (const type of ['memory-open', 'memory-place', 'memory-press'])
    assembly = apply(assembly, { type, index: 1, partIndex: 0 });
  const app = createApp({ dbPath: ':memory:' });
  try {
    const saved = await app.inject({
      method: 'POST',
      url: '/api/builds',
      payload: { name: 'RAM press test', selection, assembly },
    });
    assert.equal(saved.statusCode, 201, saved.body);
    const loaded = await app.inject({ method: 'GET', url: `/api/builds/${saved.json().data.id}` });
    assert.deepEqual(loaded.json().data.assembly, assembly);
  } finally {
    await app.close();
  }
});
