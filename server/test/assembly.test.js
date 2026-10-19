import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../src/app.js';
import {
  KIT_SELECTION,
  FLOOR_Y,
  createAssembly,
  getMemoryPart,
  getMemorySlot,
  getPartPose,
  validateTablePlacement,
  transitionAssembly,
  validateAssembly,
} from '../../shared/assembly.js';

function preassembledBoard() {
  let state = createAssembly();
  for (const action of [
    { type: 'board-to-bench' },
    { type: 'socket-open' },
    { type: 'cpu-place' },
    { type: 'cpu-lock' },
    ...[0, 1].flatMap((index) =>
      ['memory-open', 'memory-place', 'memory-lock'].map((type) => ({ type, index })),
    ),
  ])
    state = transitionAssembly(state, action);
  return state;
}

test('assembly order is advisory: install B2 first while the motherboard remains in its tray', () => {
  let state = createAssembly();
  for (const type of ['memory-open', 'memory-place', 'memory-lock'])
    state = transitionAssembly(state, { type, index: 1 });
  assert.equal(state.board, 'tray');
  assert.equal(state.cpu, 'tray');
  assert.deepEqual(state.memory, ['tray', 'locked']);
  state = transitionAssembly(state, { type: 'board-to-bench' });
  assert.deepEqual(state.memory, ['tray', 'locked']);
});

test('either physical RAM stick can use either slot without moving the motherboard or the other loose stick', () => {
  for (const [partIndex, slotIndex] of [
    [0, 1],
    [1, 0],
  ]) {
    const initial = createAssembly();
    const otherPose = { x: -230, z: 360, rotation: 90 };
    let state = transitionAssembly(initial, {
      type: 'table-place',
      part: `memory${1 - partIndex}`,
      pose: otherPose,
    });
    state = transitionAssembly(state, { type: 'memory-open', index: slotIndex });
    const before = structuredClone(state);
    const seated = transitionAssembly(state, { type: 'memory-place', index: slotIndex, partIndex });
    assert.equal(seated.memory[partIndex], 'seated');
    assert.equal(seated.memory[1 - partIndex], 'tray');
    assert.equal(seated.memorySlots[partIndex], slotIndex);
    assert.equal(seated.memorySlots[1 - partIndex], null);
    assert.equal(getMemorySlot(seated, partIndex), slotIndex);
    assert.equal(getMemoryPart(seated, slotIndex), partIndex);
    assert.equal(getMemorySlot(seated, 1 - partIndex), -1);
    assert.equal(getMemoryPart(seated, 1 - slotIndex), -1);
    assert.equal(seated.board, 'tray');
    assert.deepEqual(getPartPose(seated, `memory${1 - partIndex}`), otherPose);
    assert.deepEqual(state, before);
    state = transitionAssembly(seated, { type: 'memory-lock', index: slotIndex });
    assert.equal(state.memory[partIndex], 'locked');
    assert.equal(state.memory[1 - partIndex], 'tray');
    assert.throws(
      () => transitionAssembly(state, { type: 'memory-remove', index: partIndex }),
      /卡扣/,
    );
    state = transitionAssembly(state, { type: 'memory-open', index: slotIndex });
    assert.equal(state.memory[partIndex], 'seated');
    state = transitionAssembly(state, { type: 'memory-remove', index: partIndex });
    assert.deepEqual(state.memory, ['tray', 'tray']);
    assert.deepEqual(state.memorySlots, [null, null]);
    assert.deepEqual(getPartPose(state, `memory${1 - partIndex}`), otherPose);
  }
});

test('crossed RAM placement locks and removes the actual stick rather than the slot-numbered stick', () => {
  let state = createAssembly();
  for (const [partIndex, slotIndex] of [
    [0, 1],
    [1, 0],
  ]) {
    state = transitionAssembly(state, { type: 'memory-open', index: slotIndex });
    state = transitionAssembly(state, { type: 'memory-place', index: slotIndex, partIndex });
    state = transitionAssembly(state, { type: 'memory-lock', index: slotIndex });
  }
  assert.deepEqual(state.memorySlots, [1, 0]);
  assert.deepEqual(state.memory, ['locked', 'locked']);
  const otherPose = { ...state.layout.memory1 };
  state = transitionAssembly(state, { type: 'memory-open', index: 1 });
  assert.deepEqual(state.memory, ['seated', 'locked']);
  state = transitionAssembly(state, {
    type: 'table-place',
    part: 'memory0',
    pose: { x: 1300, z: 1000, rotation: 90, y: FLOOR_Y },
  });
  assert.deepEqual(state.memorySlots, [null, 0]);
  assert.deepEqual(state.memory, ['tray', 'locked']);
  assert.deepEqual(state.layout.memory1, otherPose);
});

test('unlocked seated RAM can change to another open empty slot, while locked or occupied slots block it', () => {
  let state = createAssembly();
  state = transitionAssembly(state, { type: 'memory-open', index: 1 });
  state = transitionAssembly(state, { type: 'memory-place', index: 1, partIndex: 0 });
  assert.equal(state.memory[0], 'seated');
  assert.throws(
    () => transitionAssembly(state, { type: 'memory-place', index: 0, partIndex: 0 }),
    /卡扣/,
  );
  state = transitionAssembly(state, { type: 'memory-open', index: 0 });
  const before = structuredClone(state);
  state = transitionAssembly(state, { type: 'memory-place', index: 0, partIndex: 0 });
  assert.deepEqual(state.memorySlots, [0, null]);
  assert.deepEqual(before.memorySlots, [1, null]);
  state = transitionAssembly(state, { type: 'memory-lock', index: 0 });
  assert.throws(
    () => transitionAssembly(state, { type: 'memory-place', index: 1, partIndex: 0 }),
    /锁定|卡扣/,
  );
  state = transitionAssembly(state, { type: 'memory-open', index: 0 });
  assert.throws(
    () => transitionAssembly(state, { type: 'memory-place', index: 0, partIndex: 1 }),
    /占用/,
  );
  assert.deepEqual(state.memory, ['seated', 'tray']);
  assert.deepEqual(state.memorySlots, [0, null]);
});

test('old version 1 RAM snapshots gain an identity mapping on edit without modifying their input', () => {
  const legacy = preassembledBoard();
  delete legacy.memorySlots;
  const before = structuredClone(legacy);
  assert.equal(validateAssembly(legacy), legacy);
  assert.equal(getMemorySlot(legacy, 1), 1);
  assert.equal(getMemoryPart(legacy, 0), 0);
  const edited = transitionAssembly(legacy, { type: 'memory-open', index: 1 });
  assert.deepEqual(edited.memorySlots, [0, 1]);
  assert.deepEqual(edited.memory, ['locked', 'seated']);
  assert.deepEqual(legacy, before);
  const removed = transitionAssembly(edited, { type: 'memory-remove', index: 1 });
  assert.deepEqual(removed.memorySlots, [0, null]);
});

test('RAM mappings reject duplicate occupants, missing placements and latches from the wrong slot', () => {
  const initial = createAssembly();
  const crossed = {
    ...initial,
    memory: ['locked', 'seated'],
    memorySlots: [1, 0],
    memoryOpen: [true, false],
  };
  assert.equal(validateAssembly(crossed), crossed);
  assert.equal(getMemorySlot(initial, 0), -1);
  assert.equal(getMemoryPart(initial, 1), -1);
  for (const invalid of [
    { ...initial, memorySlots: null },
    { ...initial, memorySlots: [] },
    { ...initial, memorySlots: [null] },
    { ...initial, memorySlots: new Array(2) },
    { ...initial, memorySlots: [null, 2] },
    { ...initial, memorySlots: ['0', null] },
    { ...initial, memorySlots: [0, null] },
    { ...initial, memory: ['locked', 'tray'], memorySlots: [null, null] },
    { ...initial, memory: ['locked', 'locked'], memorySlots: [1, 1] },
    { ...crossed, memoryOpen: [false, true] },
  ])
    assert.throws(() => validateAssembly(invalid), /内存/);
  const open = transitionAssembly(initial, { type: 'memory-open', index: 0 });
  for (const partIndex of [-1, 2, 0.5, '0', null])
    assert.throws(
      () => transitionAssembly(open, { type: 'memory-place', index: 0, partIndex }),
      /物品编号/,
    );
});

test('bare motherboard can enter the case before CPU and RAM; a closed panel blocks physical access', () => {
  const initial = createAssembly();
  assert.throws(() => transitionAssembly(initial, { type: 'cpu-place' }), /压盖/);
  assert.throws(() => transitionAssembly(initial, { type: 'screw', index: 0 }), /放入机箱/);
  assert.throws(() => transitionAssembly(initial, { type: 'board-to-case' }), /侧板/);
  let state = transitionAssembly(transitionAssembly(initial, { type: 'panel-remove' }), {
    type: 'board-to-case',
  });
  assert.equal(state.board, 'case');
  assert.equal(state.cpu, 'tray');
  state = transitionAssembly(state, { type: 'panel-close' });
  for (const action of [
    { type: 'socket-open' },
    { type: 'memory-open', index: 1 },
    { type: 'screw', index: 0 },
    { type: 'board-remove' },
  ])
    assert.throws(() => transitionAssembly(state, action), /侧板/);
  state = transitionAssembly(state, { type: 'panel-remove' });
  for (const type of ['socket-open', 'cpu-place', 'cpu-lock'])
    state = transitionAssembly(state, { type });
  for (const index of [1, 0])
    for (const type of ['memory-open', 'memory-place', 'memory-lock'])
      state = transitionAssembly(state, { type, index });
  assert.equal(state.cpu, 'locked');
  assert.deepEqual(state.memory, ['locked', 'locked']);
});

test('empty latches can close and only unsecured attachments prevent moving a motherboard', () => {
  let state = createAssembly();
  for (const type of ['socket-open', 'cpu-lock']) state = transitionAssembly(state, { type });
  for (const type of ['memory-open', 'memory-lock'])
    state = transitionAssembly(state, { type, index: 1 });
  assert.equal(state.cpu, 'tray');
  assert.equal(state.socketOpen, false);
  assert.deepEqual(state.memory, ['tray', 'tray']);
  assert.deepEqual(state.memoryOpen, [false, false]);
  for (const type of ['socket-open', 'cpu-place']) state = transitionAssembly(state, { type });
  assert.throws(() => transitionAssembly(state, { type: 'board-to-bench' }), /尚未锁定/);
  state = transitionAssembly(state, { type: 'panel-remove' });
  assert.throws(() => transitionAssembly(state, { type: 'board-to-case' }), /尚未锁定/);
  state = transitionAssembly(state, { type: 'cpu-lock' });
  assert.equal(transitionAssembly(state, { type: 'board-to-case' }).board, 'case');
});

test('fastened board cannot be lifted; unscrewing preserves attached CPU and both RAM sticks', () => {
  let state = transitionAssembly(
    transitionAssembly(preassembledBoard(), { type: 'panel-remove' }),
    { type: 'board-to-case' },
  );
  for (let index = 0; index < 4; index++)
    state = transitionAssembly(state, { type: 'screw', index });
  assert.deepEqual(state.screws, [true, true, true, true]);
  assert.throws(() => transitionAssembly(state, { type: 'board-remove' }), /所有主板固定螺丝/);
  for (let index = 0; index < 4; index++)
    state = transitionAssembly(state, { type: 'unscrew', index });
  state = transitionAssembly(state, { type: 'board-remove' });
  assert.equal(state.board, 'bench');
  assert.equal(state.cpu, 'locked');
  assert.deepEqual(state.memory, ['locked', 'locked']);
});

test('CPU and RAM can only be removed after unlocking; transitions never mutate input', () => {
  const built = preassembledBoard();
  const before = structuredClone(built);
  assert.throws(() => transitionAssembly(built, { type: 'cpu-remove' }), /打开压盖/);
  assert.throws(() => transitionAssembly(built, { type: 'memory-remove', index: 0 }), /打开卡扣/);
  const cpuRemoved = transitionAssembly(transitionAssembly(built, { type: 'socket-open' }), {
    type: 'cpu-remove',
  });
  assert.equal(cpuRemoved.cpu, 'tray');
  const ramRemoved = transitionAssembly(
    transitionAssembly(built, { type: 'memory-open', index: 1 }),
    { type: 'memory-remove', index: 1 },
  );
  assert.deepEqual(ramRemoved.memory, ['locked', 'tray']);
  assert.deepEqual(built, before);
  const fresh = createAssembly();
  fresh.memory[0] = 'locked';
  assert.deepEqual(createAssembly().memory, ['tray', 'tray']);
});

test('state validation rejects malformed and impossible saved progress', () => {
  const initial = createAssembly();
  const { screws, ...missing } = initial;
  for (const invalid of [
    null,
    [],
    {},
    missing,
    { ...initial, extra: true },
    { ...initial, version: 2 },
    { ...initial, board: 'floor' },
    { ...initial, cpu: 'installed' },
    { ...initial, memory: ['tray'] },
    { ...initial, memory: new Array(2) },
    { ...initial, screws: [0, false, false, false] },
    { ...initial, memoryOpen: ['false', false] },
    { ...initial, panelRemoved: 1 },
    { ...initial, board: 'bench', cpu: 'seated' },
    { ...initial, board: 'bench', cpu: 'locked', socketOpen: true },
    { ...initial, board: 'bench', memory: ['seated', 'tray'] },
    { ...initial, board: 'bench', memory: ['locked', 'tray'], memoryOpen: [true, false] },
    { ...initial, board: 'bench', screws: [true, false, false, false] },
  ])
    assert.throws(() => validateAssembly(invalid));
  for (const index of [-1, 2, 0.5, '0', undefined]) {
    assert.throws(
      () => transitionAssembly(preassembledBoard(), { type: 'memory-open', index }),
      /位置无效/,
    );
  }
  assert.throws(() => transitionAssembly(initial, { type: 'auto-complete' }), /未知/);
});

test('loose items can be moved and rotated repeatedly anywhere clear on the table', () => {
  const initial = createAssembly();
  let state = transitionAssembly(initial, {
    type: 'table-place',
    part: 'board',
    pose: { x: -100, z: 260, rotation: 90 },
  });
  assert.equal(state.board, 'bench');
  state = transitionAssembly(state, {
    type: 'table-place',
    part: 'board',
    pose: { x: -150, z: 230, rotation: 27 },
  });
  state = transitionAssembly(state, {
    type: 'table-place',
    part: 'cpu',
    pose: { x: 100, z: -260, rotation: 15 },
  });
  assert.deepEqual(getPartPose(state, 'board'), { x: -150, z: 230, rotation: 27 });
  assert.deepEqual(getPartPose(state, 'cpu'), { x: 100, z: -260, rotation: 15 });
  assert.deepEqual(getPartPose(initial, 'board'), { x: -570, z: -108, rotation: 0 });
  assert.deepEqual(validateAssembly(JSON.parse(JSON.stringify(state))), state);
});

test('table placement checks rotated edges, other parts and fixtures without snapping to fixed zones', () => {
  const state = createAssembly();
  assert.throws(
    () => validateTablePlacement(state, 'board', { x: 750, z: -330, rotation: 45 }),
    /桌面边缘/,
  );
  assert.throws(
    () => validateTablePlacement(state, 'cpu', getPartPose(state, 'board')),
    /主板.*重叠/,
  );
  assert.throws(
    () => validateTablePlacement(state, 'cpu', getPartPose(state, 'case')),
    /机箱.*重叠/,
  );
  assert.throws(
    () => validateTablePlacement(state, 'cpu', { x: 711, z: 336, rotation: 0 }),
    /螺丝盘.*重叠/,
  );
  const diagonal = transitionAssembly(state, {
    type: 'table-place',
    part: 'memory1',
    pose: { x: 0, z: 0, rotation: 45 },
  });
  assert.doesNotThrow(() =>
    validateTablePlacement(diagonal, 'cpu', { x: 50, z: -50, rotation: 0 }),
  );
  const original = { x: 45, z: 165, rotation: 73 };
  assert.deepEqual(validateTablePlacement(state, 'cpu', original), original);
  for (const pose of [
    { x: Infinity, z: 0, rotation: 0 },
    { x: 0, z: 0, rotation: 360 },
    { x: 0, z: 0 },
    { x: 0, z: 0, rotation: 0, y: 1 },
  ])
    assert.throws(() => validateTablePlacement(state, 'cpu', pose), /位置和旋转/);
  const overlap = structuredClone(state);
  overlap.layout.cpu = { ...overlap.layout.board };
  assert.throws(() => validateAssembly(overlap), /重叠/);
  assert.throws(() => validateAssembly({ ...state, layout: {} }), /布局字段/);
});

test('loose parts can be placed freely around the workbench and returned to the table', () => {
  const initial = createAssembly();
  const pose = { x: 1423, z: -777, rotation: 31, y: FLOOR_Y };
  let state = transitionAssembly(initial, { type: 'table-place', part: 'board', pose });
  assert.deepEqual(getPartPose(state, 'board'), pose);
  state = transitionAssembly(state, {
    type: 'table-place',
    part: 'cpu',
    pose: { x: -3481, z: 4719, rotation: 127, y: FLOOR_Y },
  });
  assert.deepEqual(validateAssembly(JSON.parse(JSON.stringify(state))), state);
  assert.throws(() => validateTablePlacement(state, 'cpu', pose), /主板.*重叠/);
  for (const pose of [
    { x: 0, z: 0, rotation: 0, y: FLOOR_Y },
    { x: 920, z: 0, rotation: 45, y: FLOOR_Y },
  ])
    assert.throws(() => validateTablePlacement(state, 'cpu', pose), /工作台占用/);
  assert.throws(
    () => validateTablePlacement(state, 'cpu', { x: 5500, z: 0, rotation: 0, y: FLOOR_Y }),
    /房间范围/,
  );
  assert.throws(
    () => validateTablePlacement(state, 'cpu', { x: 1500, z: 0, rotation: 0, y: 10 }),
    /位置和旋转/,
  );
  const tablePose = { x: 45, z: 165, rotation: 73, y: 0 };
  state = transitionAssembly(state, { type: 'table-place', part: 'cpu', pose: tablePose });
  assert.deepEqual(getPartPose(state, 'cpu'), tablePose);
  assert.deepEqual(getPartPose(initial, 'board'), { x: -570, z: -108, rotation: 0 });
});

test('removed desk decorations no longer reserve placement space while physical tools still do', () => {
  const state = createAssembly();
  for (const pose of [
    { x: -65, z: -449, rotation: 0 },
    { x: -779, z: -417, rotation: 0 },
  ])
    assert.deepEqual(validateTablePlacement(state, 'cpu', pose), pose);
  assert.throws(
    () => validateTablePlacement(state, 'cpu', { x: 765, z: 94, rotation: 0 }),
    /螺丝刀位置.*重叠/,
  );
});

test('placing a secured case on the floor carries its motherboard and preserves support height', () => {
  let state = transitionAssembly(
    transitionAssembly(preassembledBoard(), { type: 'panel-remove' }),
    {
      type: 'board-to-case',
    },
  );
  const pose = { x: 1300, z: 1000, rotation: 90, y: FLOOR_Y };
  assert.throws(
    () => transitionAssembly(state, { type: 'table-place', part: 'case', pose }),
    /尚未固定/,
  );
  for (let index = 0; index < 4; index++)
    state = transitionAssembly(state, { type: 'screw', index });
  state = transitionAssembly(state, { type: 'table-place', part: 'case', pose });
  assert.deepEqual(getPartPose(state, 'board'), { x: 1237, z: 1104, rotation: 90, y: FLOOR_Y });
  assert.equal(state.cpu, 'locked');
  assert.deepEqual(state.memory, ['locked', 'locked']);
  assert.deepEqual(getPartPose(state, 'case'), pose);
});

test('an attached panel can be placed in any clear location even when its remembered parking spot is occupied', () => {
  const state = transitionAssembly(createAssembly(), {
    type: 'table-place',
    part: 'cpu',
    pose: { x: 387, z: 357, rotation: 0 },
  });
  const before = structuredClone(state);
  assert.throws(
    () =>
      transitionAssembly(state, {
        type: 'table-place',
        part: 'panel',
        pose: getPartPose(state, 'panel'),
      }),
    /重叠/,
  );
  assert.deepEqual(state, before);
  assert.equal(state.panelRemoved, false);
  const pose = { x: -50, z: 300, rotation: 90 };
  const opened = transitionAssembly(state, { type: 'table-place', part: 'panel', pose });
  assert.equal(opened.panelRemoved, true);
  assert.deepEqual(getPartPose(opened, 'panel'), pose);
  assert.deepEqual(getPartPose(opened, 'cpu'), { x: 387, z: 357, rotation: 0 });
  assert.deepEqual(state, before);
});

test('moving the case carries the fastened motherboard, while loose boards and locked components stay protected', () => {
  let state = transitionAssembly(transitionAssembly(createAssembly(), { type: 'panel-remove' }), {
    type: 'board-to-case',
  });
  const pose = { x: 480, z: -140, rotation: 90 };
  assert.throws(
    () => transitionAssembly(state, { type: 'table-place', part: 'case', pose }),
    /尚未固定/,
  );
  for (let index = 0; index < 4; index++)
    state = transitionAssembly(state, { type: 'screw', index });
  state = transitionAssembly(state, { type: 'table-place', part: 'case', pose });
  assert.deepEqual(getPartPose(state, 'case'), pose);
  assert.equal(getPartPose(state, 'board').x, 417);
  assert.ok(Math.abs(getPartPose(state, 'board').z + 36) < 1e-8);
  assert.throws(
    () =>
      transitionAssembly(state, {
        type: 'table-place',
        part: 'board',
        pose: { x: -65, z: -34, rotation: 0 },
      }),
    /固定螺丝/,
  );
  const built = preassembledBoard();
  assert.throws(
    () =>
      transitionAssembly(built, {
        type: 'table-place',
        part: 'cpu',
        pose: { x: 45, z: 165, rotation: 0 },
      }),
    /压盖/,
  );
  const unlocked = transitionAssembly(built, { type: 'socket-open' });
  const removed = transitionAssembly(unlocked, {
    type: 'table-place',
    part: 'cpu',
    pose: { x: -300, z: 360, rotation: 30 },
  });
  assert.equal(removed.cpu, 'tray');
  assert.deepEqual(getPartPose(removed, 'cpu'), { x: -300, z: 360, rotation: 30 });
});

test('version 1 snapshots without layout use legacy poses and gain layout on their next edit', () => {
  const legacy = preassembledBoard();
  delete legacy.layout;
  assert.equal(validateAssembly(legacy), legacy);
  assert.deepEqual(getPartPose(legacy, 'board'), { x: -65, z: -34, rotation: 0 });
  const edited = transitionAssembly(legacy, { type: 'panel-remove' });
  assert.deepEqual(edited.layout.board, { x: -65, z: -34, rotation: 0 });
  const mounted = { ...legacy, board: 'case', panelRemoved: true };
  assert.deepEqual(getPartPose(mounted, 'board'), { x: 356, z: -133, rotation: 0 });
  assert.equal(legacy.layout, undefined);
});

test('API preserves omitted assembly, rejects changed kit and allows explicit reset', async () => {
  const app = createApp({ dbPath: ':memory:' });
  try {
    const progress = transitionAssembly(preassembledBoard(), {
      type: 'table-place',
      part: 'board',
      pose: { x: -100, z: 260, rotation: 90 },
    });
    const created = await app.inject({
      method: 'POST',
      url: '/api/builds',
      payload: { name: '工作台', selection: KIT_SELECTION, assembly: progress },
    });
    assert.equal(created.statusCode, 201);
    const url = `/api/builds/${created.json().data.id}`;
    const renamed = await app.inject({
      method: 'PUT',
      url,
      payload: { name: '改名', selection: KIT_SELECTION },
    });
    assert.deepEqual(renamed.json().data.assembly, progress);
    for (const selection of [
      { ...KIT_SELECTION, cpu: 'cpu-a4' },
      { ...KIT_SELECTION, gpu: 'gpu-dual' },
      {},
    ]) {
      const rejected = await app.inject({
        method: 'PUT',
        url,
        payload: { name: '更换套件', selection },
      });
      assert.equal(rejected.statusCode, 400);
      assert.equal(rejected.json().code, 'VALIDATION_ERROR');
    }
    const unchanged = await app.inject({ method: 'GET', url });
    assert.deepEqual(unchanged.json().data.assembly, progress);
    const reset = await app.inject({
      method: 'PUT',
      url,
      payload: { name: '清除进度', selection: {}, assembly: null },
    });
    assert.equal(reset.statusCode, 200);
    assert.equal(reset.json().data.assembly, null);
    const legacy = await app.inject({
      method: 'POST',
      url: '/api/builds',
      payload: { name: '普通配置', selection: {} },
    });
    assert.equal(legacy.json().data.assembly, null);
  } finally {
    await app.close();
  }
});

test('API preserves version 1 assembly without layout or memory mappings until an explicit edit', async () => {
  const app = createApp({ dbPath: ':memory:' });
  try {
    const legacy = preassembledBoard();
    delete legacy.layout;
    delete legacy.memorySlots;
    const created = await app.inject({
      method: 'POST',
      url: '/api/builds',
      payload: { name: '旧装配进度', selection: KIT_SELECTION, assembly: legacy },
    });
    assert.equal(created.statusCode, 201);
    const url = `/api/builds/${created.json().data.id}`;
    const restored = (await app.inject({ method: 'GET', url })).json().data;
    assert.deepEqual(restored.assembly, legacy);
    const assembly = transitionAssembly(legacy, {
      type: 'table-place',
      part: 'board',
      pose: { x: -100, z: 260, rotation: 90 },
    });
    const edited = await app.inject({
      method: 'PUT',
      url,
      payload: { name: '自由移动后', selection: KIT_SELECTION, assembly },
    });
    assert.equal(edited.statusCode, 200);
    assert.deepEqual(edited.json().data.assembly, assembly);
    assert.deepEqual(edited.json().data.assembly.memorySlots, [0, 1]);
  } finally {
    await app.close();
  }
});

test('API saves crossed physical RAM identities and rejects two sticks occupying one slot', async () => {
  const app = createApp({ dbPath: ':memory:' });
  try {
    let assembly = createAssembly();
    for (const [partIndex, index] of [
      [0, 1],
      [1, 0],
    ]) {
      assembly = transitionAssembly(assembly, { type: 'memory-open', index });
      assembly = transitionAssembly(assembly, { type: 'memory-place', index, partIndex });
      assembly = transitionAssembly(assembly, { type: 'memory-lock', index });
    }
    const created = await app.inject({
      method: 'POST',
      url: '/api/builds',
      payload: { name: '交叉安装', selection: KIT_SELECTION, assembly },
    });
    assert.equal(created.statusCode, 201);
    const url = `/api/builds/${created.json().data.id}`;
    const restored = (await app.inject({ method: 'GET', url })).json().data.assembly;
    assert.deepEqual(restored, assembly);
    assert.equal(getMemoryPart(restored, 0), 1);
    assert.equal(getMemoryPart(restored, 1), 0);
    const rejected = await app.inject({
      method: 'PUT',
      url,
      payload: {
        name: '重叠安装',
        selection: KIT_SELECTION,
        assembly: { ...assembly, memorySlots: [1, 1] },
      },
    });
    assert.equal(rejected.statusCode, 400);
    assert.equal(rejected.json().code, 'VALIDATION_ERROR');
    assert.deepEqual((await app.inject({ method: 'GET', url })).json().data.assembly, assembly);
  } finally {
    await app.close();
  }
});

test('API reports invalid assembly state and wrong demo kit as VALIDATION_ERROR', async () => {
  const app = createApp({ dbPath: ':memory:' });
  try {
    for (const assembly of [
      [],
      'invalid',
      {},
      { ...createAssembly(), cpu: 'locked', socketOpen: true },
      { ...createAssembly(), screws: [true, false, false, false] },
    ]) {
      const result = await app.inject({
        method: 'POST',
        url: '/api/builds',
        payload: { name: '无效', selection: KIT_SELECTION, assembly },
      });
      assert.equal(result.statusCode, 400);
      assert.equal(result.json().code, 'VALIDATION_ERROR');
    }
    const wrongKit = await app.inject({
      method: 'POST',
      url: '/api/builds',
      payload: { name: '错误套件', selection: {}, assembly: createAssembly() },
    });
    assert.equal(wrongKit.statusCode, 400);
    assert.equal(wrongKit.json().code, 'VALIDATION_ERROR');
  } finally {
    await app.close();
  }
});

test('legacy SQLite migration preserves existing records and assembly survives restart', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pc-builder-assembly-'));
  const dbPath = join(dir, 'builds.sqlite');
  const legacy = new DatabaseSync(dbPath);
  legacy.exec(
    'CREATE TABLE builds (id TEXT PRIMARY KEY, name TEXT NOT NULL, selection TEXT NOT NULL, createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL)',
  );
  legacy
    .prepare('INSERT INTO builds VALUES (?, ?, ?, ?, ?)')
    .run('legacy', '旧配置', JSON.stringify({ gpu: 'gpu-dual' }), '2026-09-01', '2026-09-02');
  legacy.close();
  let app = createApp({ dbPath });
  try {
    const old = (await app.inject({ method: 'GET', url: '/api/builds/legacy' })).json().data;
    assert.deepEqual(old, {
      id: 'legacy',
      name: '旧配置',
      selection: { gpu: 'gpu-dual' },
      createdAt: '2026-09-01',
      updatedAt: '2026-09-02',
      assembly: null,
    });
    const arranged = transitionAssembly(preassembledBoard(), {
      type: 'table-place',
      part: 'board',
      pose: { x: -100, z: 260, rotation: 90 },
    });
    let progress = transitionAssembly(transitionAssembly(arranged, { type: 'panel-remove' }), {
      type: 'board-to-case',
    });
    progress.screws[2] = true;
    progress = transitionAssembly(progress, {
      type: 'table-place',
      part: 'panel',
      pose: { x: -1537, z: 1386, rotation: 15, y: FLOOR_Y },
    });
    const created = (
      await app.inject({
        method: 'POST',
        url: '/api/builds',
        payload: { name: '保存一半', selection: KIT_SELECTION, assembly: progress },
      })
    ).json().data;
    await app.close();
    app = createApp({ dbPath });
    const restored = (await app.inject({ method: 'GET', url: `/api/builds/${created.id}` })).json()
      .data;
    assert.deepEqual(restored.assembly, progress);
    assert.equal(restored.assembly.layout.panel.y, FLOOR_Y);
    const list = (await app.inject({ method: 'GET', url: '/api/builds' })).json().data;
    assert.equal(list.length, 2);
    assert.deepEqual(
      list.find((build) => build.id === 'legacy'),
      old,
    );
  } finally {
    await app.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
