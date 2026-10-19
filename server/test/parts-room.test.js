import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';
import {
  createAssembly,
  transitionAssembly,
  validateAssembly,
  KIT_SELECTION,
} from '../../shared/assembly.js';
const selection = {
  ...KIT_SELECTION,
  motherboard: 'board-a4',
  cpu: 'cpu-a4',
  memory: 'ram-d4',
  gpu: 'gpu-dual',
  storage: 'ssd-2',
  psu: 'psu-850',
};
test('selected extra parts travel to the workbench and retain independent positions across edits', () => {
  const initial = createAssembly(selection);
  validateAssembly(initial);
  for (const part of ['gpu', 'storage', 'psu']) assert.ok(initial.layout[part]);
  const moved = transitionAssembly(initial, {
    type: 'table-place',
    part: 'storage',
    pose: { x: 0, z: 140, rotation: 90 },
  });
  const edited = transitionAssembly(moved, { type: 'socket-open' });
  assert.deepEqual(edited.layout.storage, { x: 0, z: 140, rotation: 90 });
  assert.notDeepEqual(initial.layout.storage, edited.layout.storage);
  assert.throws(
    () =>
      transitionAssembly(createAssembly(), {
        type: 'table-place',
        part: 'gpu',
        pose: { x: 0, z: 0, rotation: 0 },
      }),
    /配件区/,
  );
  assert.throws(
    () =>
      transitionAssembly(initial, {
        type: 'table-place',
        part: 'storage',
        pose: { ...initial.layout.gpu },
      }),
    /重叠/,
  );
});
test('custom compatible selection saves, reloads, and cannot replace an existing assembly kit', async () => {
  const app = createApp({ dbPath: ':memory:' });
  try {
    const payload = { name: 'custom shelves', selection, assembly: createAssembly(selection) };
    let response = await app.inject({ method: 'POST', url: '/api/builds', payload });
    assert.equal(response.statusCode, 201, response.body);
    const id = response.json().data.id;
    response = await app.inject({ method: 'GET', url: `/api/builds/${id}` });
    assert.deepEqual(response.json().data.selection, selection);
    const assembly = transitionAssembly(payload.assembly, {
      type: 'table-place',
      part: 'psu',
      pose: { x: 0, z: 200, rotation: 90 },
    });
    response = await app.inject({
      method: 'PUT',
      url: `/api/builds/${id}`,
      payload: { ...payload, assembly },
    });
    assert.equal(response.statusCode, 200, response.body);
    assert.deepEqual(response.json().data.assembly, assembly);
    response = await app.inject({
      method: 'PUT',
      url: `/api/builds/${id}`,
      payload: { ...payload, selection: { ...selection, storage: 'ssd-1' } },
    });
    assert.equal(response.statusCode, 400);
    const fork = await app.inject({
      method: 'POST',
      url: '/api/builds',
      payload: { ...payload, selection: { ...selection, storage: 'ssd-1' } },
    });
    assert.equal(fork.statusCode, 201, fork.body);
    const old = await app.inject({ method: 'GET', url: `/api/builds/${id}` });
    assert.deepEqual(old.json().data.assembly, assembly);
  } finally {
    await app.close();
  }
});
test('sync rejects socket conflicts and inventory-layout mismatches', async () => {
  const app = createApp({ dbPath: ':memory:' });
  try {
    for (const [chosen, assembly] of [
      [{ ...selection, cpu: 'cpu-a5' }, createAssembly(selection)],
      [selection, createAssembly()],
      [KIT_SELECTION, createAssembly(selection)],
    ]) {
      const response = await app.inject({
        method: 'POST',
        url: '/api/builds',
        payload: { name: 'invalid shelves', selection: chosen, assembly },
      });
      assert.equal(response.statusCode, 400, response.body);
      assert.equal(response.json().code, 'VALIDATION_ERROR');
    }
  } finally {
    await app.close();
  }
});
