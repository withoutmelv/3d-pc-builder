import test from 'node:test';
import assert from 'node:assert/strict';
import { createRoomAssembly, validateRoomSelection } from '../../shared/room.js';
import { transitionAssembly as apply } from '../../shared/assembly.js';
import { mountReady } from './helpers/mounting.js';
import { listParts } from '../src/service/parts.js';
import { createApp } from '../src/app.js';

const catalogue = listParts();
const oversized = catalogue.map((p) =>
  p.id === 'cooler-tall' ? { ...p, specs: { ...p.specs, height: 181 } } : p,
);
const selection = {
  case: 'case-air',
  motherboard: 'board-a5',
  cpu: 'cpu-a5',
  cooler: 'cooler-tall',
};
function assemble(boardFirst, chosen = selection) {
  let s = mountReady(createRoomAssembly(chosen));
  s = apply(s, { type: 'table-place', part: 'panel', pose: { x: 500, z: 0, rotation: 0 } });
  if (boardFirst) s = apply(s, { type: 'board-to-case' });
  for (const type of ['socket-open', 'cpu-place', 'cpu-lock', 'paste-apply', 'cooler-place']) {
    s = apply(s, { type });
    validateRoomSelection(s, chosen, catalogue);
  }
  for (const index of [0, 1]) s = apply(s, { type: 'cooler-screw', index });
  if (!boardFirst) s = apply(s, { type: 'board-to-case' });
  return s;
}

test('oversized tower allows either assembly order with open panel, but blocks closing', () => {
  for (const boardFirst of [false, true]) {
    const open = assemble(boardFirst);
    validateRoomSelection(open, selection, catalogue);
    const closed = apply(open, { type: 'panel-close' });
    assert.throws(() => validateRoomSelection(closed, selection, oversized), /侧板无法合上/);
    assert.equal(open.panelRemoved, true);
    const removed = apply(open, { type: 'board-remove' });
    validateRoomSelection(apply(removed, { type: 'panel-close' }), selection, catalogue);
  }
});

test('normal and exact-height towers allow closing while closed panel still blocks access', () => {
  const chosen = { ...selection, cooler: 'cooler-air' };
  const closed = apply(assemble(true, chosen), { type: 'panel-close' });
  validateRoomSelection(closed, chosen, catalogue);
  const exactHeight = catalogue.map((part) =>
    part.id === chosen.cooler ? { ...part, specs: { ...part.specs, height: 180.5 } } : part,
  );
  validateRoomSelection(closed, chosen, exactHeight);
  assert.throws(() => apply(closed, { type: 'cooler-unscrew', index: 0 }), /侧板/);
});

test('API accepts the legacy 180mm tower with the corrected 180.5mm case clearance', async () => {
  const app = createApp({ dbPath: ':memory:' });
  try {
    const assembly = assemble(false);
    const payload = { name: 'open case clearance', selection, assembly };
    const created = await app.inject({ method: 'POST', url: '/api/builds', payload });
    assert.equal(created.statusCode, 201, created.body);
    const url = `/api/builds/${created.json().data.id}`;
    const rejected = await app.inject({
      method: 'PUT',
      url,
      payload: { ...payload, assembly: apply(assembly, { type: 'panel-close' }) },
    });
    assert.equal(rejected.statusCode, 200, rejected.body);
    const read = await app.inject({ method: 'GET', url });
    assert.deepEqual(read.json().data.assembly, apply(assembly, { type: 'panel-close' }));
  } finally {
    await app.close();
  }
});
