import test from 'node:test';
import assert from 'node:assert/strict';
import { createAssembly, validateAssembly } from '../../shared/assembly.js';
import { checkPowerOn } from '../../shared/power-check.js';

const ready = () =>
  validateAssembly({
    ...createAssembly({ psu: 'psu-750' }),
    board: 'case',
    cpu: 'locked',
    memory: ['locked', 'tray'],
    memorySlots: [0, null],
    panelRemoved: true,
    screws: [true, true, true, true],
    frontPower: true,
    power: { placed: true, screws: [true, true, true, true] },
    wiring: { board: true, cpu: true, gpu: false },
    cooling: { placed: true, paste: true, screws: [true, true], fanConnected: true },
    coolerFilm: false,
  });
test('power checks report missing switch, PSU and 24Pin before CPU faults without changing state', () => {
  const original = ready();
  const frozen = structuredClone(original);
  for (const state of [
    { ...original, frontPower: false },
    { ...original, power: { placed: false, screws: [false, false, false, false] } },
    { ...original, wiring: { ...original.wiring, board: false } },
  ]) {
    assert.equal(checkPowerOn(state).stage, 'power');
    assert.equal(checkPowerOn(state).powered, false);
  }
  assert.equal(
    checkPowerOn({ ...original, wiring: { ...original.wiring, cpu: false } }).stage,
    'cpu',
  );
  assert.equal(checkPowerOn({ ...original, cpu: 'seated' }).stage, 'cpu');
  assert.deepEqual(original, frozen);
});
test('one locked DIMM is enough and storage is advisory rather than an imposed build order', () => {
  const state = ready();
  assert.equal(checkPowerOn({ ...state, memory: ['seated', 'tray'] }).stage, 'dram');
  const report = checkPowerOn(state);
  assert.equal(report.stage, 'ready');
  assert.equal(report.powered, true);
  assert.ok(report.warnings.some((message) => message.includes('M.2')));
  assert.ok(report.warnings.some((message) => message.includes('显示输出')));
  assert.match(report.message, /基础装配检查通过/);
  const partial = checkPowerOn({ ...state, screws: [false, false, false, false] });
  assert.equal(partial.stage, 'ready');
  assert.ok(partial.warnings.some((message) => message.includes('主板')));
});
test('cooling film and missing fan connection produce explicit simulated protection reports', () => {
  const state = ready();
  for (const change of [
    { coolerFilm: true },
    { cooling: { ...state.cooling, placed: false } },
    { cooling: { ...state.cooling, paste: false } },
    { cooling: { ...state.cooling, screws: [true, false] } },
    { fanConnections: [false, false] },
  ]) {
    const report = checkPowerOn({ ...state, ...change });
    assert.equal(report.stage, 'cooling');
    assert.equal(report.powered, false);
    assert.match(report.message, /模拟保护/);
  }
  assert.equal(checkPowerOn({ ...state, fanConnections: [true, false] }).stage, 'ready');
});
test('a placed dedicated GPU needs power, but absence is not treated as proof of no integrated graphics', () => {
  const state = { ...ready(), graphics: { placed: true, latchOpen: false, screwed: false } };
  assert.equal(checkPowerOn(state).stage, 'vga');
  assert.equal(checkPowerOn({ ...state, wiring: { ...state.wiring, gpu: true } }).stage, 'ready');
});
test('old assembly defaults to no switch connection and rechecking reflects repairs immediately', () => {
  assert.equal(checkPowerOn(createAssembly()).stage, 'power');
  const state = ready();
  const faulty = { ...state, coolerFilm: true };
  assert.equal(checkPowerOn(faulty).stage, 'cooling');
  assert.equal(checkPowerOn(state).stage, 'ready');
});
