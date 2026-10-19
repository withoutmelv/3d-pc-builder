import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createAssembly,
  transitionAssembly as apply,
  getCooling,
  KIT_SELECTION,
  validateAssembly,
} from '../../shared/assembly.js';
import { createApp } from '../src/app.js';
import { createLayout, validateTablePlacement } from '../../shared/workbench-layout.js';
const action = (type, index) => ({ type, ...(index === undefined ? {} : { index }) });
function cpuReady() {
  return ['socket-open', 'cpu-place', 'cpu-lock'].reduce(
    (s, type) => apply(s, action(type)),
    createAssembly(),
  );
}
function installed() {
  return apply(apply(cpuReady(), action('paste-apply')), action('cooler-place'));
}
function connected() {
  return ['cooler-screw', 'cooler-screw', 'fan-connect'].reduce(
    (s, type, i) => apply(s, action(type, i < 2 ? i : undefined)),
    installed(),
  );
}
test('cooler needs locked CPU and paste, but can be assembled before RAM or chassis', () => {
  assert.throws(() => apply(createAssembly(), action('paste-apply')), /锁定 CPU/);
  assert.throws(() => apply(cpuReady(), action('cooler-place')), /硅脂/);
  const before = cpuReady();
  const frozen = structuredClone(before);
  const state = apply(apply(before, action('paste-apply')), action('cooler-place'));
  assert.deepEqual(before, frozen);
  assert.equal(state.board, 'tray');
  assert.deepEqual(state.memory, ['tray', 'tray']);
  assert.equal(state.cooling.placed, true);
  assert.throws(() => apply(state, action('socket-open')), /移开散热器/);
  assert.throws(() => apply(state, action('paste-apply')), /移开散热器/);
});
test('either cooler screw can be first; wiring does not require completed fixation', () => {
  const state = installed();
  assert.equal(apply(state, action('fan-connect')).cooling.fanConnected, true);
  assert.throws(() => apply(state, action('board-to-bench')), /固定/);
  const one = apply(state, action('cooler-screw', 1));
  assert.deepEqual(one.cooling.screws, [false, true]);
  assert.throws(() => apply(one, action('cooler-screw', 1)), /已经旋紧/);
  const fixed = apply(one, action('cooler-screw', 0));
  assert.equal(apply(fixed, action('board-to-bench')).board, 'bench');
  assert.equal(apply(fixed, action('fan-connect')).cooling.fanConnected, true);
});
test('disconnect and loosen before removal; lifted cooler requires fresh paste', () => {
  const table = { type: 'table-place', part: 'cooler', pose: { x: -250, z: -425, rotation: 0 } };
  let state = connected();
  assert.throws(() => apply(state, table), /拔下/);
  assert.equal(apply(state, action('cooler-unscrew', 0)).cooling.fanConnected, true);
  state = apply(state, action('fan-disconnect'));
  assert.throws(() => apply(state, table), /松开/);
  for (const index of [1, 0]) state = apply(state, action('cooler-unscrew', index));
  state = apply(state, table);
  assert.deepEqual(state.cooling, {
    placed: false,
    paste: false,
    screws: [false, false],
    fanConnected: false,
  });
  assert.throws(() => apply(state, action('cooler-place')), /硅脂/);
});
test('closed chassis blocks thermal and cable operations; invalid saved cooling is rejected', () => {
  let state = connected();
  state = apply(state, action('panel-remove'));
  state = apply(state, action('board-to-case'));
  state = apply(state, action('panel-close'));
  assert.throws(() => apply(state, action('fan-disconnect')), /侧板/);
  assert.throws(() => apply(state, action('cooler-unscrew', 0)), /侧板/);
  assert.throws(() => validateAssembly({ ...createAssembly(), cooling: state.cooling }), /锁定/);
  assert.throws(
    () =>
      validateAssembly({
        ...cpuReady(),
        cooling: { placed: false, paste: true, screws: [true, false], fanConnected: false },
      }),
    /未落位/,
  );
});
test('legacy layout keeps old positions and finds clear parking for the added cooler', () => {
  const state = createAssembly();
  delete state.cooling;
  delete state.layout.cooler;
  state.layout.cpu = { x: -250, z: -425, rotation: 0 };
  const snapshot = structuredClone(state);
  validateAssembly(state);
  const layout = createLayout(state);
  assert.deepEqual(state, snapshot);
  assert.deepEqual(layout.cpu, state.layout.cpu);
  assert.equal(layout.cooler.y, -462);
  validateTablePlacement({ ...state, layout }, 'cooler', layout.cooler);
  assert.equal(getCooling(state).placed, false);
});
test('API saves full cooling and accepts old four-part saves without rewriting them', async () => {
  const app = createApp({ dbPath: ':memory:' });
  try {
    const state = connected();
    let response = await app.inject({
      method: 'POST',
      url: '/api/builds',
      payload: { name: 'cooling test', selection: KIT_SELECTION, assembly: state },
    });
    assert.equal(response.statusCode, 201, response.body);
    const id = response.json().data.id;
    response = await app.inject({ method: 'GET', url: `/api/builds/${id}` });
    assert.deepEqual(response.json().data.assembly.cooling, state.cooling);
    const legacy = createAssembly();
    delete legacy.cooling;
    delete legacy.layout.cooler;
    const selection = { ...KIT_SELECTION };
    delete selection.cooler;
    response = await app.inject({
      method: 'POST',
      url: '/api/builds',
      payload: { name: 'legacy cooling test', selection, assembly: legacy },
    });
    assert.equal(response.statusCode, 201, response.body);
    assert.deepEqual(response.json().data.assembly, legacy);
  } finally {
    await app.close();
  }
});
