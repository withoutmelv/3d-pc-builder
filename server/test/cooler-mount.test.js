import test from 'node:test';
import assert from 'node:assert/strict';
import { createRoomAssembly, changeStock, canChangeStock } from '../../shared/room.js';
import {
  createAssembly,
  transitionAssembly as apply,
  validateAssembly,
} from '../../shared/assembly.js';
import { CART_LAYOUT } from '../../shared/workbench-layout.js';
import { getMounting } from '../../shared/cooler-mount.js';
import { mountReady } from './helpers/mounting.js';
import { createApp } from '../src/app.js';
const selection = {
  motherboard: 'board-a5',
  cpu: 'cpu-a5',
  cooler: 'cooler-air',
  case: 'case-air',
};
const step = (s, type, part, index) => apply(s, { type, part, index });
const park = (s, part) => apply(s, { type: 'table-place', part, pose: CART_LAYOUT[part] });
const unscrew = (s, part) => [0, 1].reduce((v, i) => step(v, 'mount-unscrew', part, i), s);

test('each stock bar must be unscrewed and removed; mounting order is free and inputs immutable', () => {
  const initial = createRoomAssembly(selection);
  const frozen = structuredClone(initial);
  assert.throws(() => step(initial, 'mount-place', 'coolerMount0'), /占用/);
  assert.throws(() => park(initial, 'stockMount0'), /两颗/);
  const loose = unscrew(initial, 'stockMount1');
  assert.throws(() => step(loose, 'board-to-bench'), /支架尚未固定/);
  const clear = park(loose, 'stockMount1');
  assert.equal(step(clear, 'board-to-bench').board, 'bench');
  const placed = step(clear, 'mount-place', 'coolerMount1');
  assert.equal(placed.cpu, 'tray');
  assert.throws(() => step(placed, 'board-to-bench'), /支架尚未固定/);
  assert.deepEqual(initial, frozen);
  const ready = mountReady(initial);
  assert.deepEqual(ready.mounting.railScrews, [true, true, true, true]);
  assert.deepEqual(ready.mounting.stock, [false, false]);
});

test('tower installation requires secure rails; tower and closed panel obstruct support work', () => {
  let s = ['socket-open', 'cpu-place', 'cpu-lock', 'paste-apply'].reduce(
    (v, type) => step(v, type),
    createRoomAssembly(selection),
  );
  assert.throws(() => step(s, 'cooler-place'), /支架/);
  s = step(mountReady(s), 'cooler-place');
  assert.throws(() => step(s, 'mount-unscrew', 'coolerMount0', 0), /散热塔/);
  assert.throws(() => park(s, 'coolerMount0'), /散热塔/);
  let closed = mountReady(createRoomAssembly(selection));
  closed = apply(closed, { type: 'table-place', part: 'panel', pose: { x: 0, z: 0, rotation: 0 } });
  closed = step(closed, 'board-to-case');
  closed = step(closed, 'panel-close');
  assert.throws(() => step(closed, 'mount-unscrew', 'coolerMount0', 0), /侧板/);
});

test('parts must return to cart before stock changes and retained stock bars travel with board', () => {
  let s = mountReady(createRoomAssembly(selection));
  assert.equal(canChangeStock(s, 'cooler'), false);
  assert.equal(canChangeStock(s, 'motherboard'), false);
  for (const i of [0, 1]) s = park(unscrew(s, `coolerMount${i}`), `coolerMount${i}`);
  assert.equal(canChangeStock(s, 'cooler'), true);
  const replacement = changeStock(s, selection, 'cooler', 'cooler-tall');
  assert.deepEqual(replacement.assembly.mounting.stock, [false, false]);
  assert.deepEqual(replacement.assembly.mounting.railScrews, [false, false, false, false]);
  const board = changeStock(replacement.assembly, replacement.selection, 'motherboard', 'board-a4');
  assert.deepEqual(board.assembly.mounting.stock, [true, true]);
  assert.deepEqual(board.assembly.mounting.stockScrews, [true, true, true, true]);
});

test('legacy mounted bars remain usable and detached bars get a physical pose', () => {
  const old = createAssembly();
  assert.deepEqual(getMounting(old).railScrews, [true, true, true, true]);
  let s = unscrew(old, 'coolerMount0');
  s = apply(s, { type: 'table-place', part: 'coolerMount0', pose: { x: 0, z: 150, rotation: 0 } });
  assert.equal(s.mounting.rails[0], false);
  assert.equal(validateAssembly(s), s);
  assert.equal(old.mounting, undefined);
});

test('invalid mounting snapshots and inventory are rejected; unfinished state persists through API', async () => {
  const initial = createRoomAssembly(selection);
  for (const mounting of [
    null,
    {},
    { ...initial.mounting, rails: [true, false] },
    { ...initial.mounting, stock: [false, true] },
  ])
    assert.throws(() => validateAssembly({ ...initial, mounting }), /支架|卡座/);
  assert.throws(() => step(createRoomAssembly(), 'mount-place', 'coolerMount0'), /主板/);
  assert.throws(
    () => step(createRoomAssembly({ motherboard: 'board-a5' }), 'mount-place', 'coolerMount0'),
    /散热器/,
  );
  const s = step(initial, 'mount-unscrew', 'stockMount1', 0);
  const app = createApp({ dbPath: ':memory:' });
  try {
    const r = await app.inject({
      method: 'POST',
      url: '/api/builds',
      payload: { name: 'mount test', selection, assembly: s },
    });
    assert.equal(r.statusCode, 201, r.body);
    const read = await app.inject({ method: 'GET', url: `/api/builds/${r.json().data.id}` });
    assert.deepEqual(read.json().data.assembly, s);
  } finally {
    await app.close();
  }
});
