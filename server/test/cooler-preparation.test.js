import { mountReady } from './helpers/mounting.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createAssembly,
  getCoolerScrewDepths,
  transitionAssembly as apply,
  validateAssembly,
} from '../../shared/assembly.js';
import { createRoomAssembly, changeStock } from '../../shared/room.js';
import { createApp } from '../src/app.js';

const selection = { motherboard: 'board-a5', cpu: 'cpu-a5', cooler: 'cooler-air' };
const step = (s, type, index) => apply(s, { type, index });
const seated = () =>
  ['socket-open', 'cpu-place', 'cpu-lock', 'paste-apply', 'cooler-place'].reduce(
    (s, type) => step(s, type),
    mountReady(createRoomAssembly(selection)),
  );

test('film can be peeled before assembly; forgetting it does not force assembly order', () => {
  const original = createRoomAssembly(selection);
  assert.equal(original.coolerFilm, true);
  assert.equal(step(original, 'cooler-film-remove').coolerFilm, false);
  assert.equal(original.coolerFilm, true);
  assert.throws(() => step(step(original, 'cooler-film-remove'), 'cooler-film-remove'), /已经/);
  let s = seated();
  assert.equal(s.coolerFilm, true);
  assert.throws(() => step(s, 'cooler-film-remove'), /取下/);
  s = apply(s, { type: 'table-place', part: 'cooler', pose: { x: 0, z: 150, rotation: 0 } });
  assert.equal(step(s, 'cooler-film-remove').coolerFilm, false);
});

test('screws tighten incrementally in either order and partial engagement prevents removal', () => {
  const original = seated();
  let s = step(original, 'cooler-screw-step', 1);
  assert.deepEqual(getCoolerScrewDepths(original), [0, 0]);
  assert.deepEqual(getCoolerScrewDepths(s), [0, 1]);
  assert.deepEqual(s.cooling.screws, [false, false]);
  assert.throws(
    () => apply(s, { type: 'table-place', part: 'cooler', pose: { x: 0, z: 150, rotation: 0 } }),
    /松开/,
  );
  for (const i of [1, 1, 0, 0, 0]) s = step(s, 'cooler-screw-step', i);
  assert.deepEqual(s.cooling.screws, [true, true]);
  assert.throws(() => step(s, 'cooler-screw-step', 1), /已经/);
  s = step(s, 'cooler-unscrew', 1);
  assert.deepEqual(getCoolerScrewDepths(s), [3, 0]);
  s = step(s, 'cooler-screw-step', 1);
  s = step(s, 'cooler-unscrew', 1);
  assert.deepEqual(getCoolerScrewDepths(s), [3, 0]);
});

test('legacy screws remain compatible and invalid preparation state is rejected', () => {
  let s = seated();
  s = step(s, 'cooler-screw', 0);
  assert.deepEqual(getCoolerScrewDepths(s), [3, 0]);
  delete s.coolerScrewDepths;
  delete s.coolerFilm;
  assert.equal(validateAssembly(s), s);
  assert.deepEqual(getCoolerScrewDepths(s), [3, 0]);
  assert.equal(createAssembly().coolerFilm, undefined);
  for (const depths of [null, [4, 0], [1, 0], [3, -1]])
    assert.throws(() => validateAssembly({ ...s, coolerScrewDepths: depths }), /螺丝/);
  assert.throws(() => validateAssembly({ ...s, coolerFilm: 'yes' }), /保护膜/);
  assert.throws(() => step(createRoomAssembly(), 'cooler-film-remove'), /保护膜/);
});

test('new stock receives a fresh film and removes preparation state with the cooler', () => {
  let s = step(createRoomAssembly(selection), 'cooler-film-remove');
  const removed = changeStock(s, selection, 'cooler', null);
  assert.equal(removed.assembly.coolerFilm, undefined);
  const replaced = changeStock(removed.assembly, removed.selection, 'cooler', 'cooler-air');
  assert.equal(replaced.assembly.coolerFilm, true);
});

test('API preserves film and partially tightened screws', async () => {
  const app = createApp({ dbPath: ':memory:' });
  try {
    const assembly = step(seated(), 'cooler-screw-step', 0);
    const r = await app.inject({
      method: 'POST',
      url: '/api/builds',
      payload: { name: 'preparation test', selection, assembly },
    });
    assert.equal(r.statusCode, 201, r.body);
    const read = await app.inject({ method: 'GET', url: `/api/builds/${r.json().data.id}` });
    assert.deepEqual(read.json().data.assembly, assembly);
  } finally {
    await app.close();
  }
});

test('either partially engaged screw can be backed out and the tower removed without finishing', () => {
  for (const index of [0, 1]) {
    for (const depth of [1, 2]) {
      let state = seated();
      for (let i = 0; i < depth; i++) state = step(state, 'cooler-screw-step', index);
      const partial = state;
      state = step(state, 'cooler-unscrew', index);
      assert.equal(getCoolerScrewDepths(partial)[index], depth);
      assert.deepEqual(getCoolerScrewDepths(state), [0, 0]);
      state = apply(state, {
        type: 'table-place',
        part: 'cooler',
        pose: { x: 0, z: 150, rotation: 0 },
      });
      assert.equal(state.cooling.placed, false);
      validateAssembly(state);
    }
  }
});
